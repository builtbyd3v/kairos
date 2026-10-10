import { cn } from "@/lib/utils";
import { Why } from "@/components/why";
import type { Pt } from "@/lib/live";

export type MapSite = { id: string; name: string; floor: number; x: number; y: number; ok: number; total: number; anomalies: number };

const tone = (pct: number) => (pct >= 85 ? "var(--go)" : pct >= 70 ? "var(--hold)" : "var(--recall)");
const radius = (s: MapSite) => 2.5 + Math.sqrt(s.anomalies) * 1.2; // area grows with anomaly count, so WP05's 8 does not swallow its neighbors
// note: WP04 and WP05 sit 4.5 map units apart in the kit, so their circles merged into one blob. Draw them nudged apart (display only; data coords unchanged).
const NUDGE: Record<string, [number, number]> = { WP04: [-0.5, 1.2], WP05: [-4.6, 4.7] };
export const pos = (s: Pick<MapSite, "id" | "x" | "y">) => ({ x: s.x + (NUDGE[s.id]?.[0] ?? 0), y: s.y + (NUDGE[s.id]?.[1] ?? 0) });
const DOTS = Array.from({ length: 11 }, (_, i) => i * 10);
const PATH_UI = {
  walked: { stroke: "#4f9fe8", width: 1.6, dash: undefined, opacity: 1 },
  planned: { stroke: "#f4f4f4", width: 0.8, dash: "1.6 1.6", opacity: 0.35 },
  cancelled: { stroke: "#f4f4f4", width: 0.6, dash: "1 2", opacity: 0.15 },
  home: { stroke: "var(--recall)", width: 1.2, dash: "2 1.4", opacity: 0.9 },
  homeWalked: { stroke: "var(--recall)", width: 1.8, dash: undefined, opacity: 1 },
} as const;
export type MapPath = { pts: Pt[]; tone: keyof typeof PATH_UI };
/** Same-floor runs of a path; a floor change (stairs) is a gap. */
const runs = (pts: Pt[], floor: number) =>
  pts.reduce<Pt[][]>((acc, p, i) => {
    if (p.floor !== floor) return acc;
    if (i > 0 && pts[i - 1].floor === floor) acc.at(-1)!.push(p);
    else acc.push([p]);
    return acc;
  }, []);

/**
 * Two-floor waypoint map. Circle color = inspection success, size = anomaly count.
 * Optional `route` draws a mission path; `spot` marks where Spot is now; `outdoor` waypoints get a dashed ring.
 */
export function FacilityMap({
  sites,
  route,
  spot,
  wet,
  outdoor = [],
  dock,
  paths = [],
  spotAt,
  neutral,
  className,
}: {
  sites: MapSite[];
  route?: string[];
  spot?: string;
  wet?: string; // waypoint where the water model flagged water in Spot's path

  outdoor?: string[];
  dock?: string;
  paths?: MapPath[]; // drawn in order, in map coords (see pos)
  spotAt?: Pt; // Spot between waypoints, in map coords
  neutral?: string[]; // waypoints in neutral tones (these ids brighter), so only the paths and Spot carry color
  className?: string;
}) {
  const byId = new Map(sites.map((s) => [s.id, s]));
  return (
    <div className={cn("grid grid-cols-2 gap-3", className)}>
      {[1, 2].map((floor) => {
        const path = (route ?? []).map((id) => byId.get(id)).filter((s): s is MapSite => !!s && s.floor === floor);
        return (
          <figure key={floor}>
            <svg viewBox="-6 -6 112 112" className="w-full rounded-xl bg-[#0c1016] ring-1 ring-white/[0.06]" role="img" aria-label={`Floor ${floor} map`}>
              {/* Dot grid, 10 map units apart. */}
              {DOTS.flatMap((gx) => DOTS.map((gy) => <circle key={`${gx}-${gy}`} cx={gx} cy={gy} r="0.35" fill="#2a3542" />))}
              {path.length > 1 && (
                <polyline points={path.map((s) => `${pos(s).x},${pos(s).y}`).join(" ")} fill="none" stroke="#4f9fe8" strokeWidth="0.8" strokeOpacity="0.8" strokeLinejoin="round" />
              )}
              {paths.flatMap(({ pts, tone }, i) =>
                runs(pts, floor).map((run, j) => (
                  <polyline
                    key={`${i}-${j}`}
                    points={run.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={PATH_UI[tone].stroke}
                    strokeWidth={PATH_UI[tone].width}
                    strokeDasharray={PATH_UI[tone].dash}
                    strokeOpacity={PATH_UI[tone].opacity}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )),
              )}
              {paths.flatMap(({ pts }, i) =>
                pts.flatMap((p, j) =>
                  p.floor === floor && ((pts[j - 1]?.floor ?? floor) !== floor || (pts[j + 1]?.floor ?? floor) !== floor)
                    ? [<rect key={`st${i}-${j}`} x={p.x - 1.6} y={p.y - 1.6} width="3.2" height="3.2" rx="0.6" fill="#0c1016" stroke="#a8a8a2" strokeWidth="0.5"><title>Stairs to the other floor</title></rect>]
                    : [],
                ),
              )}
              {sites
                .filter((s) => s.floor === floor)
                .map((s) => {
                  const pct = s.total ? Math.round((100 * s.ok) / s.total) : 100;
                  const { x, y } = pos(s);
                  const r = neutral ? 2.6 : radius(s);
                  const fill = neutral ? (neutral.includes(s.id) ? "#8a8a84" : "#3a3a38") : tone(pct);
                  return (
                    <a
                      key={s.id}
                      href={`/waypoints/${s.id}`}
                      aria-label={`${s.id} ${s.name}: ${pct}% inspections OK, ${s.anomalies} anomalies`}
                      className="focus-visible:outline-none [&:focus-visible>circle]:stroke-foreground [&:hover>circle]:fill-opacity-45"
                    >
                      <title>{`${s.id} ${s.name}: ${pct}% inspections OK (${s.ok}/${s.total}), ${s.anomalies} anomalies`}</title>
                      {outdoor.includes(s.id) && <circle cx={x} cy={y} r={r + 3} fill="none" stroke="#7ec4ff" strokeDasharray="1.5 1.5" strokeWidth="0.6" />}
                      <circle cx={x} cy={y} r={r} fill={fill} fillOpacity={0.22} stroke={fill} strokeWidth="0.8" className="transition-[fill-opacity]" />
                      <text x={x} y={y + 1.4} textAnchor="middle" fontSize="3.8" fontWeight="600" fill="#f4f4f4" className="pointer-events-none font-mono">
                        {s.id.slice(2)}
                      </text>
                      {dock === s.id && (
                        <text x={x} y={y - r - 1.5} textAnchor="middle" fontSize="3.2" fill="#c6c6c6" className="font-mono">
                          DOCK
                        </text>
                      )}
                    </a>
                  );
                })}
              {wet && byId.get(wet)?.floor === floor && (
                <text x={pos(byId.get(wet)!).x - 4} y={pos(byId.get(wet)!).y - 3.5} textAnchor="end" fontSize="3.6" fontWeight="600" fill="var(--hold)" className="font-mono">
                  WATER
                </text>
              )}
              {spotAt?.floor === floor && (
                <g className="pointer-events-none">
                  <circle cx={spotAt.x} cy={spotAt.y} r="5" fill="#ffd60a" fillOpacity="0.25" className="origin-center animate-ping [transform-box:fill-box] motion-reduce:animate-none" />
                  <circle cx={spotAt.x} cy={spotAt.y} r="3.4" fill="#ffd60a" stroke="#161616" strokeWidth="1" />
                  <text x={spotAt.x + 5} y={spotAt.y - 3.5} fontSize="4.2" fontWeight="700" fill="#ffd60a" stroke="#0c1016" strokeWidth="1.2" paintOrder="stroke" className="font-mono">
                    SPOT
                  </text>
                </g>
              )}
              {spot && byId.get(spot)?.floor === floor && (
                // Keyed on the waypoint so the ping replays each time Spot moves.
                <g key={spot} className="pointer-events-none">
                  <circle cx={pos(byId.get(spot)!).x} cy={pos(byId.get(spot)!).y} r="2.2" fill="#f4f4f4" fillOpacity="0.5" className="origin-center animate-ping [transform-box:fill-box] motion-reduce:animate-none" />
                  <circle cx={pos(byId.get(spot)!).x} cy={pos(byId.get(spot)!).y} r="2.2" fill="#f4f4f4" stroke="#161616" strokeWidth="0.8" />
                  <text x={pos(byId.get(spot)!).x + 3.5} y={pos(byId.get(spot)!).y - 3} fontSize="3.6" fontWeight="600" fill="#f4f4f4" className="font-mono">
                    SPOT
                  </text>
                </g>
              )}
            </svg>
            <figcaption className="mt-1.5 text-center font-mono text-[11px] tracking-wider text-helper uppercase">Floor {floor}</figcaption>
          </figure>
        );
      })}
      {!neutral && <div className="col-span-2">
        <Why label="Legend">
          Color = share of inspections OK there (green ≥ 85%, yellow ≥ 70%, red below). Size = anomaly count.
          {outdoor.length > 0 && " Dashed ring = outdoor leg (assumed)."}
        </Why>
      </div>}
    </div>
  );
}
