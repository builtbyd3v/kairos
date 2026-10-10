// Render the Kairos intro (/intro) to public/intro/intro.mp4: 1920x1080, 30 fps.
// How: open /intro?t=0 in the Aside browser, step the frozen clock (window.introSeek) one frame at a time,
// screenshot the stage, then stitch the frames with ffmpeg.
// Usage: start the app on a free port first (npm run build && npm start -- -p 3078), then
//   node scripts/render-intro.mjs 3078
// note: frames are captured at the Aside window's size (2x DPR) and scaled to 1920x1080; keep that window at least 960 px wide.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = Number(process.argv[2] ?? 3078);
const FPS = 30;
const CHUNK = 400; // frames per Aside REPL call; a call may run 120 s and a frame takes about 70 ms
const url = `http://localhost:${port}/intro?t=0`;
const out = "public/intro/intro.mp4";
const frames = mkdtempSync(join(tmpdir(), "kairos-intro-"));

// One Aside REPL call. The code prints one line "RESULT <json>".
function repl(code) {
  const text = execFileSync("aside", ["repl", code], { encoding: "utf8", maxBuffer: 1 << 26, timeout: 150_000 });
  const line = text.split("\n").find((l) => l.startsWith("RESULT "));
  if (!line) throw new Error(`Aside REPL gave no result:\n${text}`);
  return JSON.parse(line.slice("RESULT ".length));
}

// Shoot frames [from, to) into the REPL session's ./artifacts.
const shoot = (from, to) => `{
  await openTab(${JSON.stringify(url)});
  for (let i = 0; i < 150; i++) {
    if (await page.evaluate(() => !!window.introSeek && document.querySelector(".intro-stage")?.dataset.t === "0")) break;
    await sleep(200);
  }
  const r = await page.evaluate(() => {
    const b = document.querySelector(".intro-stage").getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height, total: window.introTotal };
  });
  const last = Math.min(${to}, Math.round(r.total * ${FPS}));
  for (let f = ${from}; f < last; f++) {
    await page.evaluate((s) => new Promise((done) => {
      window.introSeek(s);
      const el = document.querySelector(".intro-stage");
      const tick = () => (el.dataset.t === String(s) ? requestAnimationFrame(() => done()) : requestAnimationFrame(tick));
      tick();
    }), f / ${FPS});
    await page.screenshot({
      path: "./artifacts/f" + String(f).padStart(5, "0") + ".jpg",
      clip: { x: r.x, y: r.y, width: r.width, height: r.height },
      type: "jpeg",
      quality: 95,
    });
  }
  console.log("RESULT " + JSON.stringify({ dir: typeof pwd === "function" ? await pwd() : pwd, total: r.total }));
  await closeTab(page);
}`;

let total = Infinity;
for (let from = 0; from < total * FPS; from += CHUNK) {
  const res = repl(shoot(from, from + CHUNK));
  total = res.total;
  const dir = join(res.dir, "artifacts");
  for (const f of readdirSync(dir).filter((n) => /^f\d{5}\.jpg$/.test(n))) {
    copyFileSync(join(dir, f), join(frames, f));
    rmSync(join(dir, f));
  }
  console.log(`frames ${from} to ${Math.min(from + CHUNK, Math.round(total * FPS))} of ${Math.round(total * FPS)}`);
}

mkdirSync("public/intro", { recursive: true });
execFileSync("ffmpeg", [
  "-y", "-loglevel", "error",
  "-framerate", String(FPS), "-i", join(frames, "f%05d.jpg"),
  "-vf", "scale=1920:1080:flags=lanczos,format=yuv420p",
  "-c:v", "libx264", "-crf", "18", "-preset", "slow", "-movflags", "+faststart",
  out,
], { stdio: "inherit" });
rmSync(frames, { recursive: true });
console.log(`wrote ${out}`);
