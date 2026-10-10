"use client";

import { useState } from "react";
import { detectWater, waterModel, WATER_MODEL_ID } from "@/lib/water-model";

// Speed test of the base COCO RT-DETR v2 detector in the browser. Not the water model.
// Images: copies of public/samples (NextEra kit frame + held-out test images from the Mendeley CC BY 4.0 and Kaggle CC0 sets).
const MODEL = "onnx-community/rtdetr_v2_r18vd-ONNX"; // dtype q8 loads onnx/model_quantized.onnx
const IMAGES = ["kit-pipe_gallery_01", "test-wet-public-space", "test-wet-surface", "test-dry-public-space"].map((n) => `/bench/${n}.jpg`);
const FRAMES = 20;

type Box = { label: string; score: number };
type Detector = (image: string, opts: { threshold: number }) => Promise<Box[]>;
type Device = "webgpu" | "wasm";

async function load(device: Device) {
  const { pipeline } = await import("@huggingface/transformers");
  let t = performance.now();
  const detect = (await pipeline("object-detection", MODEL, { dtype: "q8", device })) as unknown as Detector;
  const loadMs = performance.now() - t;
  t = performance.now();
  const first = await detect(IMAGES[0], { threshold: 0.3 });
  return { detect, device, loadMs, firstMs: performance.now() - t, first };
}

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

export default function BenchPage() {
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const log = (l: string) => setLines((xs) => [...xs, l]);

  async function run() {
    setBusy(true);
    setLines([]);
    try {
      // note: no cache-busting, so "cold" includes the download only on the first visit
      let r;
      try {
        if (!("gpu" in navigator)) throw new Error("navigator.gpu missing");
        r = await load("webgpu");
      } catch (e) {
        log(`WebGPU failed (${e instanceof Error ? e.message : String(e)}), using wasm`);
        r = await load("wasm");
      }
      log(`backend: ${r.device}`);
      log(`cold: pipeline ${Math.round(r.loadMs)} ms, first inference ${Math.round(r.firstMs)} ms`);
      const top = [...r.first].sort((a, b) => b.score - a.score).slice(0, 5);
      log(`first image: ${r.first.length} boxes (>=0.3), top: ${top.map((b) => `${b.label} ${b.score.toFixed(2)}`).join(", ") || "none"}`);
      const ms: number[] = [];
      for (let i = 0; i < FRAMES; i++) {
        const t = performance.now();
        await r.detect(IMAGES[i % IMAGES.length], { threshold: 0.3 });
        ms.push(performance.now() - t);
      }
      ms.sort((a, b) => a - b);
      log(`warm (${FRAMES} frames): p50 ${Math.round(pct(ms, 0.5))} ms, p95 ${Math.round(pct(ms, 0.95))} ms per frame`);
    } catch (e) {
      log(`error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  // Same timing for the shipped water model (lib/water-model.ts): WebGPU if present, else WASM, int8.
  async function runWater() {
    setBusy(true);
    setLines([]);
    try {
      let t = performance.now();
      await waterModel();
      log(`water model ${WATER_MODEL_ID}: load ${Math.round(performance.now() - t)} ms`);
      t = performance.now();
      const first = await detectWater(IMAGES[1]);
      log(`first inference ${Math.round(performance.now() - t)} ms, ${first.length} water boxes on ${IMAGES[1]}`);
      const ms: number[] = [];
      for (let i = 0; i < FRAMES; i++) {
        t = performance.now();
        await detectWater(IMAGES[i % IMAGES.length]);
        ms.push(performance.now() - t);
      }
      ms.sort((a, b) => a - b);
      log(`warm (${FRAMES} frames): p50 ${Math.round(pct(ms, 0.5))} ms, p95 ${Math.round(pct(ms, 0.95))} ms per frame`);
    } catch (e) {
      log(`error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-8">
      <h1 className="text-xl font-semibold">Detector speed test</h1>
      <p className="text-sm text-muted-foreground">
        Speed test of the base COCO model ({MODEL}, int8), not the water model. Warm frames include image decode and resize.
      </p>
      <button onClick={run} disabled={busy} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">
        {busy ? "Running..." : "Run bench"}
      </button>{" "}
      <button onClick={runWater} disabled={busy} className="rounded-md border px-4 py-2 text-sm disabled:opacity-50">
        Run water model
      </button>
      <pre className="rounded-md bg-card p-4 font-mono text-xs whitespace-pre-wrap">{lines.join("\n") || "Idle"}</pre>
    </main>
  );
}
