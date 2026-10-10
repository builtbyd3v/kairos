// Render the Kairos intro (/intro): narration audio, then the 1920x1080 30 fps video with that audio muxed in.
//   node scripts/render-intro.mjs --audio   audio only: public/intro/vo-*.aiff (one per line) and narration.m4a (the mix the page plays)
//   node scripts/render-intro.mjs 3078      audio, then video: public/intro/intro.mp4
// For the video, start the app on a free port first: npm run build && npm start -- -p 3078
// How the video works: open /intro?t=0 in the Aside browser, step the frozen clock (window.introSeek) one frame at a
// time, screenshot the stage, then encode with ffmpeg.
// note: frames are captured at the Aside window's size (2x DPR) and scaled to 1920x1080; keep that window at least 960 px wide.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FPS = 30;
const CHUNK = 200; // frames per Aside REPL call; a call may run 120 s and a frame takes about 70 to 150 ms
const DIR = "public/intro";
// note: must equal TOTAL in components/intro/intro.tsx (beat lengths x 1.5). The video step checks it against the page.
const TOTAL = 47.25;

// Narration: one short line per moment, start times in clock seconds.
const LINES = [
  [0.4, "Spot's team asked for two things: catch puddles on the route, and keep Spot inside when it rains."],
  [6.8, "Kairos flags even a small puddle, and saves the evidence to Neon."],
  [11.2, "When a storm closes in, Orbit calls Spot back to the dock."],
  [17.6, "Live radar around Saint Lucie tracks the storm, and every water find."],
  [23.8, "At the dock door, rain means hold, and the door stays shut until the next safe launch."],
  [33.5, "Spot's camera feeds a water model in the browser, Kairos adds the weather rules, and Orbit pauses or recalls the round."],
  [42.4, "Kairos. Weather and water checks for Spot, inside Orbit."],
];
// Soft rain bed under the storm (route beat) and the dock beat, clock seconds.
const RAIN = [[9.9, 17.25], [23.25, 33.0]];

const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 26 });
const seconds = (file) => Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]));

// Best installed US English voice: a Premium one (Ava first), then Enhanced, then Samantha.
function pickVoice() {
  const voices = run("say", ["-v", "?"])
    .split("\n")
    .map((l) => l.match(/^(.+?)\s+(en_US)\s+#/)?.[1].trim())
    .filter(Boolean);
  return voices.find((v) => v === "Ava (Premium)")
    ?? voices.find((v) => v.includes("(Premium)"))
    ?? voices.find((v) => v.includes("(Enhanced)"))
    ?? "Samantha";
}

function makeAudio() {
  mkdirSync(DIR, { recursive: true });
  const voice = pickVoice();
  const inputs = [];
  const chains = [];
  LINES.forEach(([at, text], i) => {
    const file = join(DIR, `vo-${i + 1}.aiff`);
    run("say", ["-v", voice, "-r", "165", "-o", file, text]);
    const end = at + seconds(file);
    const next = LINES[i + 1]?.[0] ?? TOTAL;
    if (end > next) console.warn(`line ${i + 1} ends at ${end.toFixed(2)} s, after the next cue at ${next} s`);
    inputs.push("-i", file);
    chains.push(`[${i}:a]aresample=48000,aformat=channel_layouts=mono,adelay=${Math.round(at * 1000)}[v${i}]`);
  });
  RAIN.forEach(([from, to], j) => {
    const d = to - from;
    inputs.push("-f", "lavfi", "-t", String(d), "-i", "anoisesrc=color=brown:sample_rate=48000:amplitude=0.5");
    chains.push(
      `[${LINES.length + j}:a]highpass=f=180,lowpass=f=2500,volume=0.4,afade=t=in:d=1.5,afade=t=out:st=${d - 1.5}:d=1.5,adelay=${Math.round(from * 1000)}[r${j}]`,
    );
  });
  const labels = [...LINES.map((_, i) => `[v${i}]`), ...RAIN.map((_, j) => `[r${j}]`)].join("");
  const graph = `${chains.join(";")};${labels}amix=inputs=${LINES.length + RAIN.length}:normalize=0,apad,atrim=0:${TOTAL},aformat=channel_layouts=stereo[out]`;
  const mix = join(DIR, "narration.m4a");
  run("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", graph, "-map", "[out]", "-c:a", "aac", "-b:a", "160k", mix]);
  console.log(`audio: voice ${voice}, ${seconds(mix).toFixed(2)} s`);
}

// One Aside REPL call. The code prints one line "RESULT <json>".
function repl(code) {
  const text = execFileSync("aside", ["repl", code], { encoding: "utf8", maxBuffer: 1 << 26, timeout: 150_000 });
  const line = text.split("\n").find((l) => l.startsWith("RESULT "));
  if (!line) throw new Error(`Aside REPL gave no result:\n${text}`);
  return JSON.parse(line.slice("RESULT ".length));
}

// Shoot frames [from, to) into the REPL session's ./artifacts.
const shoot = (url, from, to) => `{
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

function makeVideo(port) {
  const url = `http://localhost:${port}/intro?t=0`;
  const frames = mkdtempSync(join(tmpdir(), "kairos-intro-"));
  let total = TOTAL;
  for (let from = 0; from < total * FPS; from += CHUNK) {
    let res;
    try {
      res = repl(shoot(url, from, from + CHUNK));
    } catch (err) {
      // note: one retry per chunk; the Aside app sometimes drops a long REPL call.
      console.warn(`chunk at frame ${from} failed, retrying: ${String(err).split("\n")[0]}`);
      execFileSync("sleep", ["5"]);
      res = repl(shoot(url, from, from + CHUNK));
    }
    if (Math.abs(res.total - TOTAL) > 0.001) throw new Error(`page TOTAL is ${res.total} s, script TOTAL is ${TOTAL} s; update TOTAL here`);
    total = res.total;
    const dir = join(res.dir, "artifacts");
    for (const f of readdirSync(dir).filter((n) => /^f\d{5}\.jpg$/.test(n))) {
      copyFileSync(join(dir, f), join(frames, f));
      rmSync(join(dir, f));
    }
    console.log(`frames ${from} to ${Math.min(from + CHUNK, Math.round(total * FPS))} of ${Math.round(total * FPS)}`);
  }
  const out = join(DIR, "intro.mp4");
  run("ffmpeg", [
    "-y", "-loglevel", "error",
    "-framerate", String(FPS), "-i", join(frames, "f%05d.jpg"),
    "-i", join(DIR, "narration.m4a"),
    "-vf", "scale=1920:1080:flags=lanczos,format=yuv420p",
    "-c:v", "libx264", "-crf", "18", "-preset", "slow",
    "-c:a", "copy", "-shortest", "-movflags", "+faststart",
    out,
  ]);
  rmSync(frames, { recursive: true });
  console.log(`wrote ${out}`);
}

makeAudio();
if (process.argv[2] !== "--audio") makeVideo(Number(process.argv[2] ?? 3078));
