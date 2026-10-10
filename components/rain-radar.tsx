"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// 3x3 web-mercator tiles at zoom 9 around the plant (tile 141.87, 215.54 for 27.3486 N, 80.2464 W). Each tile is 256 px.
const Z = 9;
const XS = [140, 141, 142];
const YS = [214, 215, 216];
const PLANT = { x: (141.8718 - 140) * 256, y: (215.5371 - 214) * 256 };
const KM_PX = 1000 / 271.6; // ground resolution at this latitude and zoom: about 271.6 m per pixel
// Past frames first, live last. IEM keeps 5-minute steps back to 55 minutes.
const FRAMES = ["-m50m", "-m40m", "-m30m", "-m20m", "-m10m", ""];
const AGE = ["50 min ago", "40 min ago", "30 min ago", "20 min ago", "10 min ago", "now"];
const STEP_MS = 700;
const HOLD_LAST = 4; // the live frame stays up for 4 steps before the loop restarts

const radar = (f: string, x: number, y: number, stamp: number) =>
  `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913${f}/${Z}/${x}/${y}.png?v=${stamp}`;
const base = (x: number, y: number) => `https://tile.openstreetmap.org/${Z}/${x}/${y}.png`;

/** Live rain radar around the plant: the last 50 minutes on a loop, so a storm's direction is visible at a glance. */
export function RainRadar({ stamp, label, recorded = false }: { stamp: number; label: string; recorded?: boolean }) {
  // Recorded scenario: the frames captured with the weather snapshot, served from public/demo/radar.
  const tile = (f: string, x: number, y: number) => (recorded ? `/demo/radar/${f || "now"}-${x}-${y}.png` : radar(f, x, y, stamp));
  const [step, setStep] = useState(FRAMES.length - 1); // first paint shows the live frame
  // The loop timer is the outside system; people who prefer reduced motion keep the live frame.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setStep((s) => (s + 1) % (FRAMES.length + HOLD_LAST - 1)), STEP_MS);
    return () => clearInterval(id);
  }, []);
  const frame = Math.min(step, FRAMES.length - 1);

  return (
    <figure className="space-y-1.5">
      <div className="relative aspect-square overflow-hidden rounded-lg ring-1 ring-border">
        <div className="absolute inset-0 grid grid-cols-3">
          {YS.flatMap((y) => XS.map((x) => (
            // eslint-disable-next-line @next/next/no-img-element -- third-party map tiles
            <img key={`${x}-${y}`} src={base(x, y)} alt="" className="size-full brightness-75 contrast-125 grayscale invert" />
          )))}
        </div>
        {FRAMES.map((f, i) => (
          <div key={f || "now"} aria-hidden className={cn("absolute inset-0 grid grid-cols-3 transition-opacity duration-300", i === frame ? "opacity-80" : "opacity-0")}>
            {YS.flatMap((y) => XS.map((x) => (
              // eslint-disable-next-line @next/next/no-img-element -- third-party radar tiles
              <img key={`${x}-${y}`} src={tile(f, x, y)} alt="" className="size-full" />
            )))}
          </div>
        ))}
        <svg viewBox="0 0 768 768" className="pointer-events-none absolute inset-0 size-full" role="img" aria-label={`${label}. Rings at 20 and 50 km.`}>
          {[20, 50].map((km) => (
            <g key={km}>
              <circle cx={PLANT.x} cy={PLANT.y} r={km * KM_PX} fill="none" stroke="#f4f4f4" strokeOpacity="0.45" strokeWidth="1.5" strokeDasharray="5 5" />
              <text x={PLANT.x + 4} y={PLANT.y - km * KM_PX - 4} fontSize="14" fill="#f4f4f4" fillOpacity="0.7" className="font-mono">
                {km} km
              </text>
            </g>
          ))}
          <circle cx={PLANT.x} cy={PLANT.y} r="7" fill="var(--primary)" stroke="#161616" strokeWidth="2" />
          <text x={PLANT.x + 11} y={PLANT.y + 5} fontSize="16" fontWeight="600" fill="#f4f4f4" className="font-mono">
            ST. LUCIE
          </text>
        </svg>
        <span className="absolute top-2 left-2 rounded bg-background/80 px-1.5 py-0.5 font-mono text-[11px] tracking-wide tabular-nums">
          RADAR · {AGE[frame]}
        </span>
      </div>
      <figcaption className="text-[11px] text-helper">
        <a className="underline-offset-4 hover:underline" href="https://mesonet.agron.iastate.edu/">
          NEXRAD via IEM
        </a>{" "}
        · map ©{" "}
        <a className="underline-offset-4 hover:underline" href="https://www.openstreetmap.org/copyright">
          OpenStreetMap
        </a>
      </figcaption>
    </figure>
  );
}
