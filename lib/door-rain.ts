// Dock-door rain check: a camera classifier plus NWS / Open-Meteo, fused into GO or HOLD.
// doorVerdict is pure (no I/O) so it runs in tests, on the server and in the browser. classifyDoor is client-only.

export const DOOR_RAIN_MODEL_ID = "builtbyd3v/kairos-door-rain";
// Per dtype: highest threshold with >= 95% rain recall on the calibration split, scored one image at a time.
// From docs/model/door-rain/eval_results.json "thresholds". See docs/model/door-rain/RESULTS.md.
export const DOOR_RAIN_THRESHOLDS = { q8: 0.4447, fp32: 0.4728 } as const;
// p(rain) at or above this holds. pRain is on the q8 scale: classifyDoor maps fp32 fallback scores onto it.
export const DOOR_RAIN_THRESHOLD = DOOR_RAIN_THRESHOLDS.q8;

/** Monotone map of an fp32 score onto the q8 scale: 0, 1 and the fp32 threshold land on 0, 1 and the q8 threshold. */
export function fp32ToQ8Scale(p: number): number {
  const { fp32: from, q8: to } = DOOR_RAIN_THRESHOLDS;
  return p < from ? (p * to) / from : to + ((p - from) * (1 - to)) / (1 - from);
}

export type DoorInput = {
  camera: { pRain: number | null; status: "ok" | "stale" | "error" };
  weather: { observedRain: boolean | null; forecastRain: boolean | null };
};
export type DoorVerdict = { verdict: "GO" | "HOLD"; reasons: string[] };

/** GO only when every source is known and dry. Any rain or any unknown holds, so the camera can only add caution. */
export function doorVerdict({ camera, weather }: DoorInput): DoorVerdict {
  const hold: string[] = [];
  const ok: string[] = [];
  const { pRain, status } = camera;

  if (status !== "ok" || pRain === null || !(pRain >= 0 && pRain <= 1)) hold.push(`Door camera unknown (${status}), so rain at the door is unknown`);
  else if (pRain >= DOOR_RAIN_THRESHOLD) hold.push(`Door camera sees rain (p=${pRain.toFixed(2)})`);
  else ok.push(`Door camera sees no rain (p=${pRain.toFixed(2)})`);

  if (weather.observedRain === null) hold.push("Rain now unknown (no 15-minute nowcast)");
  else if (weather.observedRain) hold.push("Rain now at the site (15-minute nowcast)");
  else ok.push("No rain now (15-minute nowcast)");

  if (weather.forecastRain === null) hold.push("Rain forecast unknown");
  else if (weather.forecastRain) hold.push("Rain forecast for the round");
  else ok.push("No rain forecast");

  return hold.length ? { verdict: "HOLD", reasons: hold } : { verdict: "GO", reasons: ok };
}

type Classifier = (image: string) => Promise<{ label: string; score: number }[]>;
type Loaded = { run: Classifier; dtype: keyof typeof DOOR_RAIN_THRESHOLDS };
let classifier: Promise<Loaded> | null = null;

// note: same loader shape as lib/floor-model.ts (q8 first, fp32 fallback). Extract a shared helper if a third model arrives.
async function load(): Promise<Loaded> {
  const { pipeline } = await import("@huggingface/transformers");
  try {
    return { run: (await pipeline("image-classification", DOOR_RAIN_MODEL_ID, { dtype: "q8" })) as unknown as Classifier, dtype: "q8" };
  } catch {
    return { run: (await pipeline("image-classification", DOOR_RAIN_MODEL_ID, { dtype: "fp32" })) as unknown as Classifier, dtype: "fp32" };
  }
}

/** Browser only. Loads the model once, then returns p(rain) for one image URL. Throws on load or inference failure: report that as status "error". */
export async function classifyDoor(image: string): Promise<{ pRain: number; ms: number }> {
  try {
    classifier ??= load();
    const { run, dtype } = await classifier;
    const started = performance.now();
    const out = await run(image);
    const p = out.find((x) => x.label === "rain")?.score ?? 1 - (out.find((x) => x.label === "no_rain")?.score ?? 0);
    // fp32 has its own calibrated threshold; map it so doorVerdict's one threshold stays right for either dtype
    return { pRain: dtype === "fp32" ? fp32ToQ8Scale(p) : p, ms: Math.round(performance.now() - started) };
  } catch (e) {
    classifier = null; // let the next call retry the download
    throw e;
  }
}

/**
 * Weather half of the door check, from the live feed. Rain now = the latest step that started in the last 15 minutes
 * (Open-Meteo's 15-minute nowcast); forecast = any rain in the next hour. No feed, or no step in a window, is unknown (null).
 */
export function doorWeather(
  weather: { steps: { time: string; precipMmPerHour: number | null }[] } | null,
  now: Date,
): DoorInput["weather"] {
  if (!weather) return { observedRain: null, forecastRain: null };
  const t = now.getTime();
  const known = weather.steps.filter((s) => s.precipMmPerHour !== null).map((s) => ({ at: Date.parse(s.time), mm: s.precipMmPerHour! }));
  const current = known.filter((s) => s.at <= t && s.at > t - 15 * 60000).sort((a, b) => b.at - a.at)[0];
  const ahead = known.filter((s) => s.at > t && s.at <= t + 3600000);
  return { observedRain: current ? current.mm > 0 : null, forecastRain: ahead.length ? ahead.some((s) => s.mm > 0) : null };
}
