"use client";

import { useEffect, useState } from "react";
import { detectWater, WATER_MODEL_ID, WATER_THRESHOLD, type WaterDetection } from "@/lib/water-model";
import { inPath, laneAt, PATH, type Vision } from "@/lib/verdict";
import { cn } from "@/lib/utils";

export type CamFrame = { src: string; truth: number[][]; source: string; license: string; url: string };
type Result = { boxes: WaterDetection[]; ms: number } | "error";

const STEP_MS = 1400; // one capture every 1.4 s of playback
const MODEL = WATER_MODEL_ID.split("/")[1];

/** Plays a capture sequence and runs the water model on each frame. Spot stops advancing while `paused` (a floor hold). */
export function useSpotCam(frames: CamFrame[], { active, paused, waypoint }: { active: boolean; paused: boolean; waypoint: string }) {
  // The position belongs to one frame set; switching sets starts again at capture 1.
  const [pos, setPos] = useState({ set: frames, i: 0 });
  const idx = pos.set === frames ? pos.i : 0;
  const [results, setResults] = useState<Record<string, Result>>({});
  const [progress, setProgress] = useState(0);
  const frame = frames[Math.min(idx, frames.length - 1)];
  const result = results[frame.src];

  // Model runs are the outside system: one per frame, cached by image URL.
  useEffect(() => {
    if (!active || result !== undefined) return;
    let current = true;
    const started = performance.now();
    detectWater(frame.src, setProgress).then(
      (boxes) => current && setResults((r) => ({ ...r, [frame.src]: { boxes, ms: Math.round(performance.now() - started) } })),
      () => current && setResults((r) => ({ ...r, [frame.src]: "error" })),
    );
    return () => {
      current = false;
    };
  }, [active, frame.src, result]);

  // Capture clock: advances only once the current frame is checked and the floor is not held.
  const checked = result !== undefined;
  useEffect(() => {
    if (!active || paused || !checked || idx >= frames.length - 1) return;
    const id = setTimeout(() => setPos({ set: frames, i: idx + 1 }), STEP_MS);
    return () => clearTimeout(id);
  }, [active, paused, checked, idx, frames]);

  const vision: Vision | null = active
    ? {
        status: result === undefined ? "pending" : result === "error" ? "error" : "ok",
        waypoint,
        model: WATER_MODEL_ID,
        boxes: result && result !== "error" ? result.boxes.map((d) => ({ ...d.box, score: d.score })) : [],
      }
    : null;
  return { idx, frame, result, vision, progress, restart: () => setPos({ set: frames, i: 0 }) };
}

// note: ASSUMPTION: flat ground and a fixed camera; row y maps to distance d = K / (y - HORIZON). Rough, for the picture only.
const HORIZON = 0.4;
const K = 0.9; // bottom row = 1.5 m ahead
const distance = (y: number) => K / Math.max(0.02, y - HORIZON);
const LANE_M = 1.2; // ASSUMPTION: lane width on the ground

/** The camera view: frame, lane, model boxes (solid), labeled truth (dashed), HUD, and a bird's-eye "path ahead". */
export function SpotCam({ cam, frames, waypoint, total }: { cam: ReturnType<typeof useSpotCam>; frames: CamFrame[]; waypoint: string; total: number }) {
  const { frame, result, idx } = cam;
  const boxes = result && result !== "error" ? result.boxes : [];
  const blocked = boxes.some((d) => inPath(d.box));
  const state = result === undefined ? "CHECKING" : result === "error" ? "MODEL FAILED" : blocked ? "WATER IN PATH" : "PATH CLEAR";
  const tone = state === "PATH CLEAR" ? "go" : state === "CHECKING" ? "muted" : "recall";
  const square = frame.src.includes("approach");
  const [W, H] = square ? [100, 100] : [160, 90];

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_13rem]">
      <div className="overflow-hidden rounded-xl bg-black ring-1 ring-border">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/10 px-3 py-1.5 font-mono text-[11px] text-muted-foreground tabular-nums">
          <span className="text-foreground">SPOT CAM</span>
          <span>{waypoint}</span>
          <span>
            capture {idx + 1}/{total}
          </span>
          <span>
            {MODEL} q8 · t {WATER_THRESHOLD}
          </span>
          {result && result !== "error" && <span>{result.ms} ms in browser</span>}
          <span
            className={cn(
              "ml-auto rounded px-1.5 py-0.5 font-semibold",
              tone === "go" && "bg-go/20 text-go",
              tone === "recall" && "animate-pulse-soft bg-recall/25 text-recall",
              tone === "muted" && "bg-white/10 text-foreground",
            )}
          >
            {state}
          </span>
        </div>
        <div className="relative flex aspect-video items-center justify-center">
          <div className={cn("relative h-full", square ? "aspect-square" : "aspect-video")}>
            {/* eslint-disable-next-line @next/next/no-img-element -- local capture frame; overlays need its exact box */}
            <img key={frame.src} src={frame.src} alt={`Capture ${idx + 1}`} className="absolute inset-0 size-full object-fill" />
            {/* Same aspect as the frame, so one unit is the same length on both axes and labels are not stretched. */}
            <svg viewBox={`0 0 ${W} ${H}`} aria-hidden className="absolute inset-0 size-full">
              <polygon
                points={`${PATH.topL * W},${PATH.top * H} ${PATH.topR * W},${PATH.top * H} ${PATH.botR * W},${H} ${PATH.botL * W},${H}`}
                className={cn("transition-colors duration-300", blocked ? "fill-recall/20 stroke-recall" : "fill-[#2dd4bf]/12 stroke-[#2dd4bf]/70")}
                strokeWidth="0.5"
              />
              {frame.truth.map(([x, y, w, h], i) => (
                <rect key={`t${i}`} x={x * W} y={y * H} width={w * W} height={h * H} fill="none" stroke="#f4f4f4" strokeOpacity="0.85" strokeWidth="0.45" strokeDasharray="1.6 1.2" />
              ))}
              {boxes.map((d, i) => (
                <g key={`m${i}`}>
                  <rect x={d.box.x * W} y={d.box.y * H} width={d.box.w * W} height={d.box.h * H} rx="0.8" fill="none" stroke="#6ea8fe" strokeWidth="0.8" />
                  <rect x={d.box.x * W} y={Math.max(0, d.box.y * H - 4.4)} width="19" height="4.4" rx="0.8" fill="#6ea8fe" />
                  <text x={d.box.x * W + 1.2} y={Math.max(0, d.box.y * H - 4.4) + 3.2} fontSize="3.1" fontWeight="700" fill="#0b0d10" className="font-mono">
                    water {d.score.toFixed(2)}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 px-3 py-1.5 text-[11px] text-helper">
          <span>
            <span className="text-[#6ea8fe]">solid</span> = model · dashed = labeled truth · <span className="text-[#2dd4bf]">lane</span> = Spot&apos;s path (assumed)
          </span>
          <span className="ml-auto">
            {frame.source === "scand" ? "UT Austin SCAND, camera on a Spot robot" : "Held-out test photo, never trained on"} ·{" "}
            <a className="underline-offset-4 hover:underline" href={frame.url}>
              {frame.license}
            </a>{" "}
            · not NextEra
          </span>
        </div>
      </div>
      <BirdsEye boxes={boxes} />
      <span className="sr-only" aria-live="polite">
        {state} at {waypoint}, capture {idx + 1} of {total}
      </span>
      {/* Preload the next capture so the swap is instant. */}
      {frames[idx + 1] && <link rel="preload" as="image" href={frames[idx + 1].src} />}
    </div>
  );
}

/** Top-down "path ahead": Spot at the bottom, the lane, and each detection's rough footprint on the ground. */
function BirdsEye({ boxes }: { boxes: WaterDetection[] }) {
  const PX_M = 22; // pixels per meter, 0 to 12 m ahead
  const y0 = 290;
  return (
    <figure className="rounded-xl bg-black p-2 ring-1 ring-border">
      <svg viewBox="0 0 200 300" className="w-full" role="img" aria-label="Path ahead, top-down">
        <rect x="0" y="0" width="200" height="300" className="fill-[#0e1116]" />
        <rect x={100 - (LANE_M / 2) * PX_M * 2} y="20" width={LANE_M * PX_M * 2} height={y0 - 20} className="fill-[#2dd4bf]/10 stroke-[#2dd4bf]/50" strokeDasharray="3 3" />
        {[2, 4, 6, 8, 10, 12].map((m) => (
          <g key={m}>
            <line x1="20" x2="180" y1={y0 - m * PX_M} y2={y0 - m * PX_M} stroke="#ffffff" strokeOpacity="0.06" />
            <text x="4" y={y0 - m * PX_M + 3} fontSize="9" fill="#8d8d8d" className="font-mono">
              {m}m
            </text>
          </g>
        ))}
        {boxes.map((d, i) => {
          const near = Math.min(1, d.box.y + d.box.h);
          const far = Math.max(HORIZON + 0.03, d.box.y);
          const { l, r } = laneAt(near);
          const lat = ((d.box.x + d.box.w / 2 - (l + r) / 2) / (r - l)) * LANE_M; // meters right of the lane center
          const width = (d.box.w / (r - l)) * LANE_M;
          const dNear = distance(near);
          const dFar = Math.min(12, distance(far));
          if (dNear > 12) return null;
          return (
            <ellipse
              key={i}
              cx={100 + lat * PX_M * 2}
              cy={y0 - ((dNear + dFar) / 2) * PX_M}
              rx={Math.max(4, (width / 2) * PX_M * 2)}
              ry={Math.max(3, ((dFar - dNear) / 2) * PX_M)}
              className={cn(inPath(d.box) ? "fill-recall/45 stroke-recall" : "fill-[#6ea8fe]/40 stroke-[#6ea8fe]")}
            />
          );
        })}
        <polygon points={`100,${y0 - 12} 92,${y0 + 4} 108,${y0 + 4}`} className="fill-[#ffd60a]" />
      </svg>
      <figcaption className="mt-1 text-[11px] leading-snug text-helper">Path ahead, top-down. Distances assume flat ground and a fixed camera (no calibration).</figcaption>
    </figure>
  );
}
