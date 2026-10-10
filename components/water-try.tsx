"use client";

import { useState } from "react";
import { ImageUp } from "lucide-react";
import { detectWater, type WaterDetection } from "@/lib/water-model";
import { waterLikelihood } from "@/lib/water-confidence";
import { cn } from "@/lib/utils";

type Sample = { src: string; label: string };
type Shot = { src: string; w: number; h: number; boxes?: WaterDetection[]; ms?: number; failed?: boolean };

const MAX_BYTES = 10 * 1024 * 1024;

/** Run the water model on a sample or the visitor's own photo. Everything stays in the browser. */
export function WaterTry({ samples }: { samples: Sample[] }) {
  const [shot, setShot] = useState<Shot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const run = (src: string) => {
    setError(null);
    const img = new Image();
    img.onload = () => {
      const base = { src, w: img.naturalWidth, h: img.naturalHeight };
      setShot(base);
      const started = performance.now();
      detectWater(src, setProgress).then(
        (boxes) => setShot({ ...base, boxes, ms: Math.round(performance.now() - started) }),
        () => setShot({ ...base, failed: true }),
      );
    };
    img.onerror = () => setError("That file is not an image the browser can read.");
    img.src = src;
  };
  const upload = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Choose an image file (JPG, PNG or WebP).");
    if (file.size > MAX_BYTES) return setError("Choose an image under 10 MB.");
    run(URL.createObjectURL(file));
  };

  const boxes = shot?.boxes ?? [];
  return (
    <div className="space-y-3">
      <label
        className="relative flex aspect-[4/3] cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-black ring-1 ring-border hover:ring-primary/50"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          upload(e.dataTransfer.files[0]);
        }}
      >
        <input type="file" accept="image/*" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
        {shot ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- local or blob image; overlays need its exact box */}
            <img src={shot.src} alt="Checked photo" className="absolute inset-0 size-full object-contain" />
            {/* meet = the same fit as object-contain, so boxes land where the image shows them */}
            <svg viewBox={`0 0 ${shot.w} ${shot.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden className="absolute inset-0 size-full">
              {boxes.map((d, i) => {
                const [x, y, w, h] = [d.box.x * shot.w, d.box.y * shot.h, d.box.w * shot.w, d.box.h * shot.h];
                const u = Math.max(shot.w, shot.h) / 100; // 1% of the long side
                const pct = waterLikelihood(d.score)?.pct;
                const label = pct === undefined ? "water" : pct <= 50 ? `maybe water ${pct}%` : `water ${pct}%`;
                return (
                  <g key={i}>
                    <rect x={x} y={y} width={w} height={h} rx={u} fill="#6ea8fe" fillOpacity="0.08" stroke="#6ea8fe" strokeOpacity="0.25" strokeWidth={u * 1.8} />
                    <rect x={x} y={y} width={w} height={h} rx={u} fill="none" stroke="#8ab8ff" strokeWidth={u * 0.5} />
                    <rect x={x} y={Math.max(0, y - u * 4.6)} width={label.length * u * 1.95 + u * 2.6} height={u * 4.2} rx={u} fill="#6ea8fe" />
                    <text x={x + u * 1.3} y={Math.max(0, y - u * 4.6) + u * 3.05} fontSize={u * 3.1} fontWeight="700" fill="#0b0d10" className="font-mono">
                      {label}
                    </text>
                  </g>
                );
              })}
            </svg>
            <span className="absolute top-2 right-2 rounded bg-background/85 px-2 py-1 font-mono text-[11px] tabular-nums">
              {shot.failed ? "model failed" : shot.boxes ? `${boxes.length ? `${boxes.length} wet area${boxes.length > 1 ? "s" : ""}` : "no water found"} · ${shot.ms} ms` : progress > 0 && progress < 100 ? `loading model ${progress}%` : "checking"}
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <ImageUp aria-hidden className="size-6" />
            Drop a photo here, or click to choose one
            <span className="text-xs text-helper">It never leaves your browser</span>
          </span>
        )}
      </label>
      {error && <p className="text-sm text-hold">{error}</p>}
      <div className="grid grid-cols-5 gap-2">
        {samples.map((s) => (
          <button key={s.src} onClick={() => run(s.src)} className={cn("overflow-hidden rounded-lg ring-1 ring-border hover:ring-primary/60", shot?.src === s.src && "ring-2 ring-primary")} title={s.label}>
            {/* eslint-disable-next-line @next/next/no-img-element -- local sample thumbnail */}
            <img src={s.src} alt={s.label} className="aspect-square w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
