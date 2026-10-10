"use client";

import { useRef, useState } from "react";
import { Droplets, ImageUp, LoaderCircle } from "lucide-react";
import { VerdictChip } from "@/components/status";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MODEL = "builtbyd3v/spot-wetfloor-convnext-tiny";

type Classifier = (image: string) => Promise<{ label: string; score: number }[]>;
type Result = { src: string; pWet: number; ms: number };

const SAMPLES = [
  { src: "/samples/test-wet-public-space.jpg", label: "Held-out test: puddle" },
  { src: "/samples/test-wet-surface.jpg", label: "Held-out test: wet street" },
  { src: "/samples/test-dry-public-space.jpg", label: "Held-out test: dry pavement" },
  { src: "/samples/kit-pipe_gallery_01.jpg", label: "NextEra kit: pipe gallery" },
  { src: "/samples/kit-gauge_pressure_01.jpg", label: "NextEra kit: gauge" },
  { src: "/samples/kit-thermal_pump_bearing_01.jpg", label: "NextEra kit: thermal" },
];

// One classifier per page; transformers.js caches the model files in the browser after the first download.
let classifier: Promise<Classifier> | null = null;

async function load(onProgress: (pct: number) => void): Promise<Classifier> {
  const { pipeline } = await import("@huggingface/transformers");
  const progress_callback = (p: { status: string; progress?: number }) => {
    if (p.status === "progress" && p.progress !== undefined) onProgress(Math.round(p.progress));
  };
  try {
    // Smaller int8 weights first; fall back to full precision if the quantized file is not on the Hub.
    return (await pipeline("image-classification", MODEL, { dtype: "q8", progress_callback })) as unknown as Classifier;
  } catch {
    return (await pipeline("image-classification", MODEL, { dtype: "fp32", progress_callback })) as unknown as Classifier;
  }
}

// Loads the model once (module-level, outside React), then classifies one image.
async function check(src: string, onProgress: (pct: number) => void): Promise<Omit<Result, "src">> {
  if (!classifier) classifier = load(onProgress);
  try {
    const run = await classifier;
    const started = performance.now();
    const out = await run(src);
    const pWet = out.find((x) => x.label === "wet")?.score ?? 1 - (out.find((x) => x.label === "dry")?.score ?? 0);
    return { pWet, ms: Math.round(performance.now() - started) };
  } catch (e) {
    classifier = null; // let the next click retry the download
    throw e;
  }
}

export function FloorCheck() {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  async function classify(src: string) {
    setBusy(true);
    if (status !== "ready") setStatus("loading");
    try {
      const r = await check(src, setProgress);
      setStatus("ready");
      setResult({ src, ...r });
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }

  const wet = result !== null && result.pWet > 0.5;

  return (
    <div className="grid grid-cols-[1fr_22rem] gap-6">
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {SAMPLES.map((s) => (
            <button
              key={s.src}
              onClick={() => classify(s.src)}
              disabled={busy}
              className={cn(
                "overflow-hidden rounded text-left ring-1 ring-border hover:ring-link focus-visible:outline-2 focus-visible:outline-link disabled:opacity-60",
                result?.src === s.src && "ring-2 ring-link",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- local sample thumbnails, no optimization needed */}
              <img src={s.src} alt={s.label} className="aspect-video w-full object-cover" />
              <span className="block bg-card px-2 py-1 text-xs text-muted-foreground">{s.label}</span>
            </button>
          ))}
        </div>
        <input
          ref={file}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Upload a floor image"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) classify(URL.createObjectURL(f));
          }}
        />
        <Button variant="outline" onClick={() => file.current?.click()} disabled={busy}>
          <ImageUp aria-hidden /> Check your own image
        </Button>
      </div>

      <div className="space-y-3" aria-live="polite">
        {status === "idle" && <p className="text-sm text-muted-foreground">Pick an image. The model downloads once, then runs in this browser with no server.</p>}
        {status === "loading" && (
          <p className="flex items-center gap-2 text-sm">
            <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> Downloading model… {progress}%
          </p>
        )}
        {status === "error" && <p className="text-sm text-recall">The model could not load. Check the network and try again.</p>}
        {result && (
          <div className={cn("space-y-2 rounded p-4 ring-1", wet ? "bg-hold/10 ring-hold/40" : "bg-secondary ring-border")}>
            {/* eslint-disable-next-line @next/next/no-img-element -- user image preview */}
            <img src={result.src} alt="Checked image" className="max-h-40 w-full rounded object-cover" />
            <p className="flex items-center gap-2 text-lg font-semibold">
              <Droplets aria-hidden className={cn("size-5", wet ? "text-hold" : "text-helper")} />
              {wet ? "Possible standing water" : "No water detected"}
            </p>
            <p className="font-mono text-sm">p(wet) = {result.pWet.toFixed(2)} · {result.ms} ms in browser</p>
            <p className="flex items-start gap-2 text-sm">
              {wet ? (
                <>
                  <VerdictChip verdict="HOLD" /> Hold this waypoint until an operator confirms the floor. Wet floors make Spot slip (Spot guide p.21).
                </>
              ) : (
                <span className="text-muted-foreground">Advisory only: &quot;no water detected&quot; never means the route is safe.</span>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
