"use client";

import { useEffect, useId, useState } from "react";
import { detectWater, WATER_MODEL_ID, type WaterDetection } from "@/lib/water-model";
import { waterLikelihood } from "@/lib/water-confidence";
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
      (e) => {
        console.error("Kairos water model failed", e); // the HUD shows MODEL OFFLINE; the console says why
        if (current) setResults((r) => ({ ...r, [frame.src]: "error" }));
      },
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

/** The camera view: frame, heading glow, model boxes with real confidence, labeled truth as corner marks, HUD, and an "Around Spot" 360 radar. */
export function SpotCam({ cam, frames, waypoint, total }: { cam: ReturnType<typeof useSpotCam>; frames: CamFrame[]; waypoint: string; total: number }) {
  const { frame, result, idx } = cam;
  const gid = useId();
  const boxes = result && result !== "error" ? result.boxes : [];
  const blocked = boxes.some((d) => inPath(d.box));
  const standby = cam.vision === null;
  const state = standby ? "STANDBY" : result === undefined ? "CHECKING" : result === "error" ? "MODEL OFFLINE" : blocked ? "WATER IN PATH" : "PATH CLEAR";
  const tone = state === "PATH CLEAR" ? "go" : state === "CHECKING" || standby ? "muted" : "recall";
  const square = frame.source !== "scand"; // Kaggle frames are 608x608; SCAND frames are 16:9
  const [W, H] = square ? [100, 100] : [160, 90];
  const lane = blocked ? "#ff6b6b" : "#2dd4bf";
  const cx = ((PATH.topL + PATH.topR) / 2) * W;

  return (
    <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_14rem]">
      <div className="overflow-hidden rounded-xl bg-black ring-1 ring-border">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/10 px-3 py-1.5 font-mono text-[11px] text-muted-foreground tabular-nums">
          <span className="text-foreground">SPOT CAM</span>
          <span>{waypoint}</span>
          <span>
            capture {idx + 1}/{total}
          </span>
          <span>{MODEL}</span>
          {result && result !== "error" && <span>{result.ms} ms</span>}
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
        <div className="relative flex aspect-video items-center justify-center overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element -- blurred fill behind a non-16:9 frame */}
          <img src={frame.src} alt="" aria-hidden className="absolute inset-0 size-full scale-110 object-cover opacity-40 blur-2xl" />
          <div className={cn("relative h-full", square ? "aspect-square" : "aspect-video")}>
            {/* eslint-disable-next-line @next/next/no-img-element -- local capture frame; overlays need its exact box */}
            <img key={frame.src} src={frame.src} alt={`Capture ${idx + 1}`} className={cn("absolute inset-0 size-full object-fill transition-opacity", standby && "opacity-30")} />
            {/* Same aspect as the frame, so one unit is the same length on both axes and labels are not stretched. */}
            <svg viewBox={`0 0 ${W} ${H}`} aria-hidden className="absolute inset-0 size-full">
              <defs>
                <linearGradient id={`${gid}-lane`} x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0" stopColor={lane} stopOpacity="0.32" />
                  <stop offset={1 - PATH.top} stopColor={lane} stopOpacity="0" />
                </linearGradient>
              </defs>
              {!standby && (
                <>
                  {/* Heading glow: where Spot will walk, fading toward the horizon. */}
                  <polygon
                    points={`${PATH.topL * W},${PATH.top * H} ${PATH.topR * W},${PATH.top * H} ${PATH.botR * W},${H} ${PATH.botL * W},${H}`}
                    fill={`url(#${gid}-lane)`}
                  />
                  {[0.9, 0.76, 0.63].map((y, i) => {
                    const half = ((laneAt(y).r - laneAt(y).l) * W) / 7;
                    return (
                      <polyline
                        key={y}
                        points={`${cx - half},${y * H + half * 0.55} ${cx},${y * H} ${cx + half},${y * H + half * 0.55}`}
                        fill="none"
                        stroke="#ffffff"
                        strokeOpacity={0.55 - i * 0.15}
                        strokeWidth="0.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    );
                  })}
                </>
              )}
              {frame.truth.map(([x, y, w, h], i) => {
                // Labeled truth as faint corner marks, so it never reads as a detection.
                const c = Math.min(w * W, h * H) * 0.22;
                const [x0, y0, x1, y1] = [x * W, y * H, (x + w) * W, (y + h) * H];
                return (
                  <path
                    key={`t${i}`}
                    d={`M${x0},${y0 + c}V${y0}H${x0 + c} M${x1 - c},${y0}H${x1}V${y0 + c} M${x1},${y1 - c}V${y1}H${x1 - c} M${x0 + c},${y1}H${x0}V${y1 - c}`}
                    fill="none"
                    stroke="#ffffff"
                    strokeOpacity="0.6"
                    strokeWidth="0.5"
                  />
                );
              })}
              {boxes.map((d, i) => {
                const [x, y, w, h] = [d.box.x * W, d.box.y * H, d.box.w * W, d.box.h * H];
                // Calibrated: "boxes scoring like this were real water N in 10" (lib/water-confidence.ts).
                const pct = waterLikelihood(d.score)?.pct;
                const label = pct === undefined ? "water" : pct <= 50 ? `maybe water ${pct}%` : `water ${pct}%`;
                const pillW = label.length * 1.86 + 2.6;
                const pillY = y >= 5 ? y - 4.8 : y + 0.6;
                return (
                  <g key={`m${i}`}>
                    <rect x={x} y={y} width={w} height={h} rx="1.4" fill="#6ea8fe" fillOpacity="0.08" stroke="#6ea8fe" strokeOpacity="0.25" strokeWidth="2.4" />
                    <rect x={x} y={y} width={w} height={h} rx="1.4" fill="none" stroke="#8ab8ff" strokeWidth="0.75" />
                    <rect x={x} y={pillY} width={pillW} height="4.2" rx="1.2" fill="#6ea8fe" />
                    <text x={x + 1.3} y={pillY + 3.05} fontSize="3.1" fontWeight="700" fill="#0b0d10" className="font-mono">
                      {label}
                    </text>
                  </g>
                );
              })}
            </svg>
            {standby && (
              <p className="absolute inset-0 grid place-items-center font-mono text-sm tracking-wide text-foreground">CAMERA STARTS AT {waypoint}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 px-3 py-1.5 text-[11px] text-helper">
          <span>
            <span className="text-[#8ab8ff]">▢</span> water % = how often boxes like this were real water · <span className="text-foreground">⌜⌟</span> labeled truth · <span className="text-[#2dd4bf]">▲</span> heading
          </span>
          <a className="ml-auto underline-offset-4 hover:underline" href={frame.url}>
            {frame.source === "scand" ? "Spot camera, UT Austin SCAND" : "Example photo, held out"} · {frame.license}
          </a>
        </div>
      </div>
      <AroundSpot boxes={boxes} />
      <span className="sr-only" aria-live="polite">
        {state} at {waypoint}, capture {idx + 1} of {total}
      </span>
      {/* Preload the next capture so the swap is instant. */}
      {frames[idx + 1] && <link rel="preload" as="image" href={frames[idx + 1].src} />}
    </div>
  );
}

// note: ASSUMPTION: the demo frame is a 70 degree forward view. Spot CAM+ sees 360 degrees; Kairos would run the model on each slice.
const FOV = 70;
const RING_M = [2, 4, 6, 8];
const PX_M = 11; // radar pixels per meter

/** "Around Spot": top-down radar with Spot in the middle, the camera's slice of the 360 view, and each puddle at its bearing and distance. */
function AroundSpot({ boxes }: { boxes: WaterDetection[] }) {
  const gid = useId();
  const C = 100;
  // Rounded so server and browser trig render identical markup (no hydration mismatch).
  const round = (v: number) => Math.round(v * 100) / 100;
  const at = (deg: number, r: number) => ({ x: round(C + r * Math.sin((deg * Math.PI) / 180)), y: round(C - r * Math.cos((deg * Math.PI) / 180)) });
  const R = RING_M.at(-1)! * PX_M;
  const a = at(-FOV / 2, R);
  const b = at(FOV / 2, R);
  return (
    <figure className="rounded-xl bg-black p-2 ring-1 ring-border">
      <svg viewBox="0 0 200 200" className="w-full" role="img" aria-label="Around Spot: the camera slice and detected water, top-down">
        <defs>
          <radialGradient id={`${gid}-fov`} cx={C} cy={C} r={R} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#2dd4bf" stopOpacity="0.35" />
            <stop offset="1" stopColor="#2dd4bf" stopOpacity="0.04" />
          </radialGradient>
        </defs>
        <rect width="200" height="200" className="fill-[#0b0e13]" />
        {/* Full 360: faint, tick every 30 degrees. */}
        {RING_M.map((m) => (
          <circle key={m} cx={C} cy={C} r={m * PX_M} fill="none" stroke="#ffffff" strokeOpacity={m === RING_M.at(-1) ? 0.18 : 0.07} />
        ))}
        {Array.from({ length: 12 }, (_, i) => {
          const p = at(i * 30, R);
          const q = at(i * 30, R - 4);
          return <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#ffffff" strokeOpacity="0.25" />;
        })}
        <path d={`M${C},${C} L${a.x},${a.y} A${R},${R} 0 0 1 ${b.x},${b.y} Z`} fill={`url(#${gid}-fov)`} />
        {RING_M.slice(0, -1).map((m) => (
          <text key={m} x={C + 3} y={C + m * PX_M - 2} fontSize="7" fill="#6f6f6f" className="font-mono">
            {m}m
          </text>
        ))}
        <text x={C} y={C - R - 4} textAnchor="middle" fontSize="8" fill="#9a9a9a" className="font-mono">
          FRONT
        </text>
        {boxes.map((d, i) => {
          const near = Math.min(1, d.box.y + d.box.h);
          const meters = Math.min(RING_M.at(-1)!, distance(near));
          const { l, r } = laneAt(near);
          const p = at((d.box.x + d.box.w / 2 - 0.5) * FOV, meters * PX_M);
          const rx = Math.max(3, ((d.box.w / (r - l)) * LANE_M * PX_M) / 2);
          const hit = inPath(d.box);
          return (
            <g key={i}>
              <ellipse cx={p.x} cy={p.y} rx={rx + 3} ry={rx * 0.6 + 3} fill={hit ? "#ff6b6b" : "#6ea8fe"} fillOpacity="0.18" />
              <ellipse cx={p.x} cy={p.y} rx={rx} ry={rx * 0.6} fill={hit ? "#ff6b6b" : "#6ea8fe"} fillOpacity="0.75" />
            </g>
          );
        })}
        {/* Spot from above: body, head toward the front, four legs. */}
        <g transform={`translate(${C} ${C})`}>
          {[-1, 1].flatMap((sx) => [-1, 1].map((sy) => <rect key={`${sx}${sy}`} x={sx * 7 - 2} y={sy * 9 - 2.5} width="4" height="5" rx="1.5" fill="#1b1b1b" stroke="#3a3a3a" strokeWidth="0.6" />))}
          <rect x="-6" y="-12" width="12" height="24" rx="4" fill="#ffd60a" />
          <rect x="-4" y="-15" width="8" height="5" rx="2" fill="#1b1b1b" />
        </g>
      </svg>
      <figcaption className="mt-1 flex justify-between text-[11px] text-helper">
        <span>Around Spot · 360°</span>
        <span title="Distances assume flat ground and a fixed, uncalibrated camera">approx.</span>
      </figcaption>
    </figure>
  );
}
