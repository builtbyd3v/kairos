// Dock-door rain check: a camera classifier plus NWS / Open-Meteo, fused into GO or HOLD.
// doorVerdict is pure (no I/O) so it runs in tests, on the server and in the browser. classifyDoor is client-only.

export const DOOR_RAIN_MODEL_ID = "builtbyd3v/kairos-door-rain";
// p(rain) at or above this holds: highest q8 threshold with >= 95% rain recall on the calibration split. See docs/model/door-rain/RESULTS.md.
export const DOOR_RAIN_THRESHOLD = 0.786;

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

  if (weather.observedRain === null) hold.push("Observed rain unknown");
  else if (weather.observedRain) hold.push("Rain observed at the site");
  else ok.push("No rain observed");

  if (weather.forecastRain === null) hold.push("Rain forecast unknown");
  else if (weather.forecastRain) hold.push("Rain forecast for the round");
  else ok.push("No rain forecast");

  return hold.length ? { verdict: "HOLD", reasons: hold } : { verdict: "GO", reasons: ok };
}

type Classifier = (image: string) => Promise<{ label: string; score: number }[]>;
let classifier: Promise<Classifier> | null = null;

// note: same loader shape as lib/floor-model.ts (q8 first, fp32 fallback). Extract a shared helper if a third model arrives.
async function load(): Promise<Classifier> {
  const { pipeline } = await import("@huggingface/transformers");
  try {
    return (await pipeline("image-classification", DOOR_RAIN_MODEL_ID, { dtype: "q8" })) as unknown as Classifier;
  } catch {
    return (await pipeline("image-classification", DOOR_RAIN_MODEL_ID, { dtype: "fp32" })) as unknown as Classifier;
  }
}

/** Browser only. Loads the model once, then returns p(rain) for one image URL. Throws on load or inference failure: report that as status "error". */
export async function classifyDoor(image: string): Promise<{ pRain: number; ms: number }> {
  try {
    classifier ??= load();
    const run = await classifier;
    const started = performance.now();
    const out = await run(image);
    const pRain = out.find((x) => x.label === "rain")?.score ?? 1 - (out.find((x) => x.label === "no_rain")?.score ?? 0);
    return { pRain, ms: Math.round(performance.now() - started) };
  } catch (e) {
    classifier = null; // let the next call retry the download
    throw e;
  }
}
