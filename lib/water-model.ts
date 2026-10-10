// Kairos water detector v2 (fine-tuned RT-DETRv2-R18, one class "water"), run in the browser with transformers.js.
// Client-only: call from event handlers or effects. Advisory only: "no water found" never means the floor is dry.
import type { RawImage, Tensor } from "@huggingface/transformers";

export const WATER_MODEL_ID = "builtbyd3v/kairos-water-rtdetr";
/** Score cutoff picked on the calibration split (never the test split). See docs/model/water-v2/RESULTS.md. */
export const WATER_THRESHOLD = 0.49;

/** Box is normalized 0-1 (x, y = top-left). areaFrac = w * h, the share of the frame the box covers. */
export type WaterDetection = { box: { x: number; y: number; w: number; h: number }; score: number; areaFrac: number };
type ImageInput = string | URL | Blob | HTMLCanvasElement | OffscreenCanvas | RawImage;

type Loaded = {
  run: (pixel_values: Tensor) => Promise<{ logits: Tensor; pred_boxes: Tensor }>;
  prep: (image: RawImage) => Promise<{ pixel_values: Tensor }>;
  read: (image: ImageInput) => Promise<RawImage>;
};

let loaded: Promise<Loaded> | null = null;

async function load(onProgress: (pct: number) => void): Promise<Loaded> {
  const { AutoModel, AutoProcessor, RawImage } = await import("@huggingface/transformers");
  const progress_callback = (p: { status: string; progress?: number }) => {
    if (p.status === "progress" && p.progress !== undefined) onProgress(Math.round(p.progress));
  };
  const processor = await AutoProcessor.from_pretrained(WATER_MODEL_ID, { progress_callback });
  // WebGPU when the browser has it, else the default backend (WASM in browsers, CPU in Node). int8 weights; the eval checks q8 against fp32.
  const gpu = typeof navigator !== "undefined" && "gpu" in navigator;
  const model = await (gpu ? AutoModel.from_pretrained(WATER_MODEL_ID, { dtype: "q8", device: "webgpu", progress_callback }) : Promise.reject()).catch(
    () => AutoModel.from_pretrained(WATER_MODEL_ID, { dtype: "q8", progress_callback }),
  );
  return {
    run: (pixel_values) => model({ pixel_values }) as Promise<{ logits: Tensor; pred_boxes: Tensor }>,
    prep: (image) => processor(image) as Promise<{ pixel_values: Tensor }>,
    read: (image) => RawImage.read(image),
  };
}

/** The cached model: starts the download on first call, so it also pre-warms. */
export function waterModel(onProgress: (pct: number) => void = () => {}): Promise<Loaded> {
  if (!loaded) {
    loaded = load(onProgress);
    loaded.catch(() => (loaded = null)); // let the next call retry the download
  }
  return loaded;
}

const iou = (a: WaterDetection["box"], b: WaterDetection["box"]) => {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  return inter / (a.w * a.h + b.w * b.h - inter || 1);
};

/**
 * Sigmoid scores over the 300 queries (one class), keep >= threshold, greedy NMS at IoU 0.5.
 * note: transformers.js's object-detection pipeline uses softmax and drops the last class, which drops every
 * box of a one-class model, so we post-process here. Same rule as docs/model/water-v2/evaluate.py.
 */
export function decode(logits: ArrayLike<number>, boxes: ArrayLike<number>, threshold = WATER_THRESHOLD): WaterDetection[] {
  const found: WaterDetection[] = [];
  for (let q = 0; q < logits.length; q++) {
    const score = 1 / (1 + Math.exp(-logits[q]));
    if (score < threshold) continue;
    const [cx, cy, w, h] = [boxes[q * 4], boxes[q * 4 + 1], boxes[q * 4 + 2], boxes[q * 4 + 3]];
    const x = Math.max(0, cx - w / 2), y = Math.max(0, cy - h / 2);
    const box = { x, y, w: Math.min(1, cx + w / 2) - x, h: Math.min(1, cy + h / 2) - y };
    found.push({ box, score, areaFrac: box.w * box.h });
  }
  found.sort((a, b) => b.score - a.score);
  const kept: WaterDetection[] = [];
  for (const d of found) if (kept.every((k) => iou(k.box, d.box) < 0.5)) kept.push(d);
  return kept;
}

/** Loads the model once (module-level, outside React), then finds water boxes in one image. */
export async function detectWater(image: ImageInput, onProgress?: (pct: number) => void): Promise<WaterDetection[]> {
  try {
    const m = await waterModel(onProgress);
    const { pixel_values } = await m.prep(await m.read(image));
    const out = await m.run(pixel_values);
    return decode(out.logits.data as Float32Array, out.pred_boxes.data as Float32Array);
  } catch (e) {
    loaded = null; // let the next call retry the download
    throw e;
  }
}
