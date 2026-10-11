import { cn } from "@/lib/utils";

// Recorded radar around the plant (public/demo/radar, captured with the weather snapshot), one frame chosen by the caller.
// Same 3x3 zoom-9 tiles as components/rain-radar.tsx.
const XS = [140, 141, 142];
const YS = [214, 215, 216];
const PLANT = { x: (141.8718 - 140) * 256, y: (215.5371 - 214) * 256 };
const KM_PX = 1000 / 271.6;
export const RADAR_FRAMES = ["-m50m", "-m40m", "-m30m", "-m20m", "-m10m", "now"];

/** Recorded radar, oldest frame (0) to newest (5). `stamp` labels the frame's recorded time. */
export function StormRadar({ frame, stamp, className }: { frame: number; stamp: string; className?: string }) {
  return (
    <div className={cn("relative aspect-square overflow-hidden rounded-lg ring-1 ring-border", className)}>
      <div className="keep-grid absolute inset-0 grid grid-cols-3">
        {YS.flatMap((y) =>
          XS.map((x) => (
            // eslint-disable-next-line @next/next/no-img-element -- third-party map tiles
            <img key={`${x}-${y}`} src={`https://tile.openstreetmap.org/9/${x}/${y}.png`} alt="" className="size-full brightness-75 contrast-125 grayscale invert" />
          )),
        )}
      </div>
      {RADAR_FRAMES.map((f, i) => (
        <div key={f} aria-hidden className={cn("keep-grid absolute inset-0 grid grid-cols-3 transition-opacity duration-500", i === frame ? "opacity-85" : "opacity-0")}>
          {YS.flatMap((y) =>
            XS.map((x) => (
              // eslint-disable-next-line @next/next/no-img-element -- recorded radar tiles
              <img key={`${x}-${y}`} src={`/demo/radar/${f}-${x}-${y}.png`} alt="" className="size-full" />
            )),
          )}
        </div>
      ))}
      <svg viewBox="0 0 768 768" className="pointer-events-none absolute inset-0 size-full" role="img" aria-label={`Recorded rain radar around the St. Lucie plant, ${stamp}. Ring at 20 km.`}>
        <circle cx={PLANT.x} cy={PLANT.y} r={20 * KM_PX} fill="none" stroke="#f4f4f4" strokeOpacity="0.5" strokeWidth="2" strokeDasharray="6 6" />
        <circle cx={PLANT.x} cy={PLANT.y} r="9" fill="var(--primary)" stroke="#161616" strokeWidth="2.5" />
        <text x={PLANT.x + 13} y={PLANT.y + 6} fontSize="22" fontWeight="600" fill="#f4f4f4" stroke="#161616" strokeWidth="4" paintOrder="stroke" className="font-mono">
          PLANT
        </text>
      </svg>
      <span className="absolute top-1.5 left-1.5 rounded bg-background/80 px-1.5 py-0.5 font-mono text-[10px] tabular-nums">RADAR {stamp}</span>
    </div>
  );
}
