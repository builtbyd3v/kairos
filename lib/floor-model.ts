// Fine-tuned wet-floor classifier, run in the browser with transformers.js. Client-only: call from event handlers or effects.
export const FLOOR_MODEL = "builtbyd3v/spot-wetfloor-convnext-tiny";

type Classifier = (image: string) => Promise<{ label: string; score: number }[]>;
export type FloorResult = { pWet: number; ms: number };

// One classifier per page; transformers.js caches the model files in the browser after the first download.
let classifier: Promise<Classifier> | null = null;

async function load(onProgress: (pct: number) => void): Promise<Classifier> {
  const { pipeline } = await import("@huggingface/transformers");
  const progress_callback = (p: { status: string; progress?: number }) => {
    if (p.status === "progress" && p.progress !== undefined) onProgress(Math.round(p.progress));
  };
  try {
    // Smaller int8 weights first; fall back to full precision if the quantized file is not on the Hub.
    return (await pipeline("image-classification", FLOOR_MODEL, { dtype: "q8", progress_callback })) as unknown as Classifier;
  } catch {
    return (await pipeline("image-classification", FLOOR_MODEL, { dtype: "fp32", progress_callback })) as unknown as Classifier;
  }
}

/** The cached classifier: starts the download on first call, so it also pre-warms. */
export function floorModel(onProgress: (pct: number) => void = () => {}): Promise<Classifier> {
  if (!classifier) {
    classifier = load(onProgress);
    classifier.catch(() => (classifier = null)); // let the next call retry the download
  }
  return classifier;
}

/** Loads the model once (module-level, outside React), then classifies one image. */
export async function checkFloor(src: string, onProgress: (pct: number) => void): Promise<FloorResult> {
  try {
    const run = await floorModel(onProgress);
    const started = performance.now();
    const out = await run(src);
    const pWet = out.find((x) => x.label === "wet")?.score ?? 1 - (out.find((x) => x.label === "dry")?.score ?? 0);
    return { pWet, ms: Math.round(performance.now() - started) };
  } catch (e) {
    classifier = null; // let the next call retry the download
    throw e;
  }
}
