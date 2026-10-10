import { LIMITS } from "./verdict.ts";

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
  // Wet ground in the door camera frame, from the water detector (lib/water-model.ts). The rain classifier is advisory only.
  camera: { wetGround: boolean | null; status: "ok" | "stale" | "error" };
  // thunder: any step in the hour after with a thunder chance at or above the round rules' threshold (lightning is bad weather too).
  weather: { observedRain: boolean | null; forecastRain: boolean | null; thunder?: boolean | null };
};
// HOLD is for weather only. Puddles (or an unchecked door camera) need an operator OK, not a hold: Spot can route around water.
export type DoorVerdict = { verdict: "GO" | "HOLD"; reasons: string[]; operatorCheck: string | null };

/** Rain now, rain in the next hour, or unknown weather holds Spot. Water at the door asks the operator instead. */
export function doorVerdict({ camera, weather }: DoorInput): DoorVerdict {
  const hold: string[] = [];
  const ok: string[] = [];

  if (weather.observedRain === null) hold.push("Rain now unknown");
  else if (weather.observedRain) hold.push("Rain now at the site");
  else ok.push("No rain now");

  if (weather.forecastRain === null) hold.push("Rain forecast unknown");
  else if (weather.forecastRain) hold.push("Rain forecast for the round");
  else ok.push("No rain forecast");

  if (weather.thunder) hold.push("Thunderstorm risk in the hour after");

  const operatorCheck =
    camera.status !== "ok" || camera.wetGround === null ? "Door camera not checked: operator looks at the door" : camera.wetGround ? "Puddles at the door: operator OKs the route around them" : null;
  if (!operatorCheck) ok.push("Door camera sees no water");

  return hold.length ? { verdict: "HOLD", reasons: hold, operatorCheck } : { verdict: "GO", reasons: ok, operatorCheck };
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
 * Weather half of the door check. Rain now = the newest step that started in the last hour (Open-Meteo's 15-minute
 * nowcast when present, else the hourly NWS step); forecast = any rain in the next hour. No feed, or no step in a window, is unknown (null).
 */
// note: ASSUMPTION: below 0.25 mm/h is a trace, not rain at the door. NWS spreads 6-hour totals over hours, so most hours carry a trace.
export const RAIN_MM_H = 0.25;

export function doorWeather(
  weather: { steps: { time: string; precipMmPerHour: number | null; thunderPct?: number | null }[] } | null,
  now: Date,
): DoorInput["weather"] {
  if (!weather) return { observedRain: null, forecastRain: null, thunder: null };
  const t = now.getTime();
  const known = weather.steps.filter((s) => s.precipMmPerHour !== null).map((s) => ({ at: Date.parse(s.time), mm: s.precipMmPerHour! }));
  // The newest step covering t: a 15-minute nowcast step when there is one, else the hourly NWS step.
  const current = known.filter((s) => s.at <= t && s.at > t - 60 * 60000).sort((a, b) => b.at - a.at)[0];
  const ahead = known.filter((s) => s.at > t && s.at <= t + 3600000);
  const thunderAhead = weather.steps.filter((s) => s.thunderPct != null && Date.parse(s.time) > t - 60 * 60000 && Date.parse(s.time) <= t + 3600000);
  return {
    observedRain: current ? current.mm >= RAIN_MM_H : null,
    forecastRain: ahead.length ? ahead.some((s) => s.mm >= RAIN_MM_H) : null,
    thunder: thunderAhead.length ? thunderAhead.some((s) => s.thunderPct! >= LIMITS.thunderPct) : null,
  };
}
