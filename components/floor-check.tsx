"use client";

import { useRef, useState } from "react";
import { Droplets, ImageUp, LoaderCircle } from "lucide-react";
import { VerdictChip } from "@/components/status";
import { Button } from "@/components/ui/button";
import { checkFloor } from "@/lib/floor-model";
import { cn } from "@/lib/utils";

type Result = { src: string; pWet: number; ms: number };

const SAMPLES = [
  { src: "/samples/test-wet-public-space.jpg", label: "Held-out test: puddle" },
  { src: "/samples/test-wet-surface.jpg", label: "Held-out test: wet street" },
  { src: "/samples/test-dry-public-space.jpg", label: "Held-out test: dry pavement" },
  { src: "/samples/kit-pipe_gallery_01.jpg", label: "NextEra kit: pipe gallery" },
  { src: "/samples/kit-gauge_pressure_01.jpg", label: "NextEra kit: gauge" },
  { src: "/samples/kit-thermal_pump_bearing_01.jpg", label: "NextEra kit: thermal" },
];

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
      const r = await checkFloor(src, setProgress);
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
                "overflow-hidden rounded-lg text-left ring-1 ring-white/[0.06] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:ring-link focus-visible:outline-2 focus-visible:outline-link disabled:opacity-60 motion-reduce:hover:translate-y-0",
                result?.src === s.src && "ring-2 ring-link",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- local sample thumbnails, no optimization needed */}
              <img src={s.src} alt={s.label} className="aspect-video w-full object-cover" />
              <span className="block bg-card px-2 py-1.5 font-mono text-[11px] text-muted-foreground">{s.label}</span>
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
          <div key={result.src} className={cn("animate-rise space-y-2 rounded-xl p-4", wet ? "bg-hold/10 ring-1 ring-hold/40" : "panel-inset")}>
            {/* eslint-disable-next-line @next/next/no-img-element -- user image preview */}
            <img src={result.src} alt="Checked image" className="max-h-40 w-full rounded-lg object-cover" />
            <p className="flex items-center gap-2 text-lg font-semibold">
              <Droplets aria-hidden className={cn("size-5", wet ? "text-hold" : "text-helper")} />
              {wet ? "Possible standing water" : "No water detected"}
            </p>
            <p className="font-mono text-sm tabular-nums">p(wet) = {result.pWet.toFixed(2)} · {result.ms} ms in browser</p>
            <svg viewBox="0 0 100 6" preserveAspectRatio="none" className="h-2 w-full" aria-hidden>
              {Array.from({ length: 20 }, (_, i) => (
                <rect key={i} x={i * 5} width={4} height={6} rx={1} className={i < Math.round(result.pWet * 20) ? (wet ? "fill-hold" : "fill-helper") : "fill-white/[0.06]"} />
              ))}
              <rect x={49.5} y={-1} width={1} height={8} className="fill-foreground/60" />
            </svg>
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
