// Render the Kairos demo video: the intro up to "Here is how it works.", a narrated recording of the real app, then the intro's end card.
//   node --env-file=.env.local scripts/render-demo.mjs 3020      writes out/kairos-demo.mp4 (1920x1080, 30 fps, H.264 + AAC) and out/still-*.jpg
//   node --env-file=.env.local scripts/render-demo.mjs --audio   narration clips only (out/vo/*.mp3)
// Start the app first: npm run build && npm start -- -p 3020
// note: narration clips are cached in out/vo/ by a hash of their text, so a re-run spends no ElevenLabs credit unless a line changed.
//       Copy out/vo/ along if you render from another checkout.
// How it works: the app has a recording hook (app/layout.tsx, inert unless ?rec=1) that freezes the page clock. This script drives
// the Aside browser through one long-lived `aside repl`, steps the clock one video frame at a time, and screenshots each frame.
// While the page waits on real work (the water model, a Neon write), the clock runs in real time and no frames are taken: dead time is cut.
// note: each run uses a new host (kairos-<id>.localhost), so the browser has no cookies there: a fresh visitor, a fresh Neon branch.
// note: frames are the top 16:9 strip of the Aside window (2x DPR), scaled to 1920x1080. Keep that window about 1440 x 900 or larger.
// After a UI change, only the UI text below should need edits; nothing here uses pixel coordinates.
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FPS = 30;
const OUT = "out";
const INTRO = "public/intro/intro.mp4";
const CUT = 28.8 + 1.49 + 0.25; // intro line 5 "Here is how it works." starts at 28.8 s and lasts 1.49 s (render-intro.mjs)
const TAIL = [41.1, 45.75]; // intro end card to its end: the tagline line runs 41.2 to 43.85 s (render-intro.mjs)

// What the script looks for on screen. Regexes match the page's visible text (innerText); names are button labels.
// Scroll targets are text (case-insensitive) of the element to bring to the top of the frame, or "bottom" to show it whole.
const UI = {
  chart: "IP54 limit", // dashboard card titles to scroll to
  map: "plant map",
  dashReady: /Next safe launch/,
  busy: /CHECKING/, // Spot cam HUD while the water model runs
  speed: "4x",
  restart: "Restart",
  firstCheck: /PATH CLEAR/,
  held: /Confirm water/,
  confirm: "Confirm water",
  saved: /Saved to Neon as evidence/,
  recall: /RECALL:/,
  docked: /Spot is docked/,
  sample: "Held-out puddle photo 4",
  modelReady: /Drop a photo here/,
  modelHit: /\d wet areas? · \d+ ms/,
  evidenceReady: /live round/,
};

// Narration, same voice as the intro, a little faster and livelier (VOICE). Lines state only what is on screen.
const LINES = {
  dash: "A storm we recorded at St. Lucie. Rain is over Spot's IP54 limit, so Kairos calls a recall.",
  walk: "On a simulated round, our water model checks every stop.",
  hold: "Water in the path. Spot holds, and the operator confirms.",
  recall: "The storm hits 2.8 millimeters an hour. Recall. Spot walks home.",
  model: "Our fine-tuned water model runs right in the browser, and catches 85 percent of wet photos.",
  evidence: "Every detection and label lands in Neon, scored on a frozen branch.",
};
// ElevenLabs voice_settings (https://elevenlabs.io/docs/api-reference/text-to-speech/convert). speed runs 0.7 to 1.2
// (https://elevenlabs.io/docs/best-practices/prompting/controls); lower stability = broader emotional range; style 0 is the default.
const VOICE = { stability: 0.35, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true, speed: 1.12 };
// note: the water model page labels the photo with its measured ms. In the Aside browser that is about 200 ms (bench p50 196 ms),
// next to the page's "~100 ms" stat measured on WebGPU in Chrome. The video hides that one label instead of showing a
// misleading pair; nothing is changed. Set false to show it.
const HIDE_MS = true;

const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 26 });
const seconds = (file) => Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]));

// Same ElevenLabs voice and model as scripts/render-intro.mjs ("Misa - Sweet & Calm Conversations").
const ELEVEN = { id: "XlDdozLmuTofIxK4BjPD", model: "eleven_multilingual_v2" };
const VOICE_KEY = JSON.stringify(VOICE);
async function voice() {
  mkdirSync(join(OUT, "vo"), { recursive: true });
  const files = {};
  let chars = 0;
  for (const [key, text] of Object.entries(LINES)) {
    const file = join(OUT, "vo", `${createHash("sha1").update(`${ELEVEN.id} ${VOICE_KEY} ${text}`).digest("hex").slice(0, 12)}.mp3`);
    if (!existsSync(file)) {
      if (!process.env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not set and a narration clip is missing");
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN.id}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "content-type": "application/json", accept: "audio/mpeg" },
        body: JSON.stringify({ text, model_id: ELEVEN.model, voice_settings: VOICE }),
      });
      if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      chars += text.length;
    }
    files[key] = { file, dur: seconds(file) };
  }
  console.log(`narration: ${Object.keys(files).length} clips, ${chars} new ElevenLabs characters`);
  return files;
}

// One long-lived Aside REPL, so a page keeps its state between calls. Each call is one line; the code prints "RESULT <json>".
function aside() {
  const p = spawn("aside", ["repl"], { stdio: ["pipe", "pipe", "pipe"] });
  let buf = "";
  let waiting = null;
  const onData = (d) => {
    buf += String(d).replace(/\x1b\[[0-9;]*m/g, "");
    const m = buf.match(/\[(ok|error) \| [\d.]+m?s\]/);
    if (!m || !waiting) return;
    const out = buf.slice(0, m.index);
    buf = buf.slice(m.index + m[0].length);
    const w = waiting;
    waiting = null;
    const line = out.split("\n").find((l) => l.includes("RESULT "));
    if (m[1] === "error" || !line) w.err(new Error(`Aside REPL: ${out.trim()}`));
    else w.ok(JSON.parse(line.slice(line.indexOf("RESULT ") + 7)));
  };
  p.stdout.on("data", onData);
  p.stderr.on("data", onData);
  return {
    call: (code) => new Promise((ok, err) => {
      waiting = { ok, err };
      p.stdin.write(`${code.replace(/\n\s*/g, " ")}\n`);
    }),
    close: () => p.stdin.end(),
  };
}

// Helpers defined once inside the REPL. The page clock is window.__rec (app/layout.tsx).
const HELPERS = `
globalThis.D = { n: 0, clip: null };
globalThis.has = async (re) => new RegExp(re).test(await page.evaluate(() => document.body.innerText));
globalThis.free = () => page.evaluate(() => window.__rec.free());
globalThis.waitFor = async (re, ms) => { const t0 = Date.now(); await free(); while (!(await has(re))) { if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + re); await sleep(100); } };
globalThis.yOf = ([re, at]) => re === null ? 0 : page.evaluate(([s, at, ch]) => { const r = new RegExp(s, "i"); const e = [...document.querySelectorAll("body *")].find((e) => r.test(e.textContent) && ![...e.children].some((c) => r.test(c.textContent))); if (!e) throw new Error("no element with text " + s); const b = e.getBoundingClientRect(); return Math.max(0, Math.round(at === "bottom" ? b.bottom + scrollY + 40 - ch : b.top + scrollY - 20)); }, [re, at, D.clip.height]);
globalThis.go = async (url) => { if (page) await closeTab(page); await openTab(url); if (!(await page.evaluate(() => !!window.__rec))) throw new Error("no recording hook on " + url); await free(); const [w, h] = await page.evaluate(() => [innerWidth, innerHeight]); if (h < Math.round((w * 9) / 16)) throw new Error("Aside window is too short for 16:9: " + w + "x" + h); D.clip = { x: 0, y: 0, width: w, height: Math.round((w * 9) / 16) }; };
globalThis.shoot = async ({ n, rate = 1, until = null, busy = null, pan = null, save = true }) => {
  const from = pan ? await page.evaluate(() => scrollY) : 0; const to = pan ? await yOf(pan) : 0;
  for (let i = 0; i < n; i++) {
    if (busy) while (await has(busy)) { await free(); await sleep(50); }
    if (until && (await has(until))) return { n: D.n, hit: true };
    const y = pan ? Math.round(from + ((to - from) * (1 - Math.cos((Math.PI * (i + 1)) / n))) / 2) : null;
    await page.evaluate(([ms, y]) => { if (y !== null) window.scrollTo(0, y); window.__rec.step(ms); }, [(1000 / 30) * rate, y]);
    if (save) { await page.screenshot({ path: "./artifacts/demo/f" + String(D.n).padStart(5, "0") + ".jpg", type: "jpeg", quality: 92, clip: D.clip }); D.n++; }
  }
  return { n: D.n, hit: false };
};
await fs.mkdir("./artifacts/demo", { recursive: true });
console.log("RESULT " + JSON.stringify({ dir: pwd }));`;

async function record(port, vo) {
  const base = `http://kairos-${Date.now().toString(36)}.localhost:${port}`;
  const a = aside();
  const r = (code) => a.call(`${code}; console.log("RESULT " + JSON.stringify({ n: D.n }))`);
  const cues = []; // [frame, clip key]
  let n = 0;
  // Frames until `until` shows (or n frames). Chunked: one REPL call must finish inside Aside's 120 s limit.
  const shoot = async (opts) => {
    let left = opts.n;
    while (left > 0) {
      const chunk = Math.min(150, left);
      const o = { ...opts, n: chunk, until: opts.until?.source ?? null, busy: opts.busy?.source ?? null };
      const res = await a.call(`console.log("RESULT " + JSON.stringify(await shoot(${JSON.stringify(o)})))`);
      left -= res.n - n;
      n = res.n;
      if (res.hit) return true;
      if (opts.save === false) left -= chunk;
    }
    if (opts.until) throw new Error(`did not see ${opts.until} in ${opts.n} frames`);
    return false;
  };
  const say = (key) => {
    cues.push([n, key]);
    return n + Math.ceil((vo[key].dur + 0.1) * FPS); // frame after the line ends, plus a breath
  };
  const holdUntil = (frame, min = 0) => shoot({ n: Math.max(min, frame - n) });
  const open = async (path, ready) => {
    await r(`await go(${JSON.stringify(`${base}${path}?rec=1`)}); await waitFor(${JSON.stringify(ready.source)}, 60000); await sleep(1500)`);
    await shoot({ n: 30, save: false }); // settle: entrance animations finish, hydration effects run
  };
  // The clock runs free from the click on, so a measured time (the model's ms) is real; the next frame freezes it again.
  const click = (name) => r(`await free(); await page.getByRole("button", { name: ${JSON.stringify(name)} }).click()`);

  const { dir } = await a.call(HELPERS);
  const seg = {};
  try {
    // 2. Dashboard: RECALL headline and the rain chart, then a quick move to the plant map.
    seg.dash = n;
    await open("/", UI.dashReady);
    let end = say("dash");
    await shoot({ n: Math.round((end - n) * 0.55) });
    await shoot({ n: 12, pan: [UI.map, "top"] });
    await holdUntil(end + 20, 30);

    // 3. Live round at the app's 4x, sped up 4x more on the walk to the puddle. Each line starts on its action.
    seg.live = n;
    await open("/live", UI.firstCheck);
    await click(UI.speed);
    await click(UI.restart);
    say("walk");
    await shoot({ n: 8 });
    await shoot({ n: 900, rate: 4, busy: UI.busy, until: UI.held });
    end = say("hold");
    await shoot({ n: 12, pan: [UI.confirm, "bottom"] }); // the HOLD card and its buttons sit under the camera
    await holdUntil(end - 20, 30); // click as the line says "confirms"
    await click(UI.confirm);
    await r(`await waitFor(${JSON.stringify(UI.saved.source)}, 90000)`);
    await shoot({ n: 12 }); // "Saved to Neon as evidence #N"
    await shoot({ n: 12, rate: 2, pan: [null, "top"] }); // back up to the weather watch
    await shoot({ n: 600, rate: 2, busy: UI.busy, until: UI.recall });
    end = say("recall");
    await shoot({ n: 600, until: UI.docked });
    await holdUntil(end, 15);

    // 4. Water model: one wet photo with its "water N%" box. The first run (model load) is off camera.
    seg.model = n;
    await open("/floor-check", UI.modelReady);
    await click(UI.sample);
    await r(`await sleep(400); await waitFor(${JSON.stringify(UI.modelHit.source)}, 120000)`);
    if (HIDE_MS) await r(`await page.evaluate((s) => { const re = new RegExp(s); const e = [...document.querySelectorAll("body *")].find((e) => re.test(e.textContent) && ![...e.children].some((c) => re.test(c.textContent))); if (e) e.style.visibility = "hidden"; }, ${JSON.stringify(UI.modelHit.source)})`);
    end = say("model");
    await holdUntil(end, 60);

    // 5. Evidence: this run's detection and the operator's label in Neon, and the frozen-branch scores.
    seg.evidence = n;
    await open("/evidence", UI.evidenceReady);
    end = say("evidence");
    await holdUntil(end + 10, 90);
  } finally {
    await a.call(`if (page) await closeTab(page); console.log("RESULT {}")`).catch(() => {});
    a.close();
  }
  return { dir: join(dir, "artifacts", "demo"), frames: n, cues, seg };
}

function encode({ dir, frames, cues, seg }, vo) {
  const tmp = mkdtempSync(join(tmpdir(), "kairos-demo-"));
  readdirSync(dir).filter((f) => /^f\d{5}\.jpg$/.test(f)).forEach((f) => (copyFileSync(join(dir, f), join(tmp, f)), rmSync(join(dir, f))));
  const app = frames / FPS;
  const total = CUT + app + (TAIL[1] - TAIL[0]);
  if (total >= 90) console.warn(`total ${total.toFixed(2)} s is over the 90 s limit: shorten a line or a hold`);
  const voIn = cues.flatMap(([, key]) => ["-i", vo[key].file]);
  const st = "aformat=sample_rates=48000:channel_layouts=stereo";
  const graph = [
    `[0:v]trim=0:${CUT},setpts=PTS-STARTPTS[v0]`,
    `[1:v]scale=1920:1080:flags=lanczos,setsar=1,format=yuv420p[v1]`,
    `[0:v]trim=${TAIL[0]}:${TAIL[1]},setpts=PTS-STARTPTS[v2]`,
    `[v0][v1][v2]concat=n=3:v=1:a=0[v]`,
    `[0:a]atrim=0:${CUT},afade=t=out:st=${CUT - 0.3}:d=0.3,${st}[a0]`,
    `[0:a]atrim=${TAIL[0]}:${TAIL[1]},asetpts=PTS-STARTPTS,afade=t=out:st=${TAIL[1] - TAIL[0] - 0.4}:d=0.4,${st},adelay=${Math.round((CUT + app) * 1000)}:all=1[a1]`,
    // Same chain as the intro's lines (render-intro.mjs): 48 kHz mono, volume 2.5.
    ...cues.map(([f], i) => `[${i + 2}:a]aresample=48000,aformat=channel_layouts=mono,volume=2.5,${st},adelay=${Math.round((CUT + f / FPS) * 1000)}:all=1[c${i}]`),
    `[a0][a1]${cues.map((_, i) => `[c${i}]`).join("")}amix=inputs=${cues.length + 2}:normalize=0,atrim=0:${total},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]`,
  ].join(";");
  const out = join(OUT, "kairos-demo.mp4");
  run("ffmpeg", [
    "-y", "-loglevel", "error",
    "-i", INTRO,
    "-framerate", String(FPS), "-i", join(tmp, "f%05d.jpg"),
    ...voIn,
    "-filter_complex", graph, "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-crf", "18", "-preset", "slow", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
    out,
  ]);
  rmSync(tmp, { recursive: true });
  // One still per segment (its middle frame), for a quick look after each render.
  const mid = (a, b) => CUT + (a + b) / 2 / FPS;
  const at = { intro: 10, dash: mid(seg.dash, seg.live), live: mid(seg.live, seg.model), model: mid(seg.model, seg.evidence), evidence: mid(seg.evidence, frames), end: total - 1.5 };
  for (const [k, t] of Object.entries(at)) run("ffmpeg", ["-y", "-loglevel", "error", "-ss", t.toFixed(2), "-i", out, "-frames:v", "1", join(OUT, `still-${k}.jpg`)]);
  console.log(`wrote ${out}: ${seconds(out).toFixed(2)} s (app part ${app.toFixed(2)} s, ${frames} frames)`);
}

const vo = await voice();
if (process.argv[2] !== "--audio") encode(await record(Number(process.argv[2] ?? 3020), vo), vo);
