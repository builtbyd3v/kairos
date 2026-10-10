import { cn } from "@/lib/utils";

export type MapSite = { id: string; name: string; floor: number; x: number; y: number; ok: number; total: number; anomalies: number };

const tone = (pct: number) => (pct >= 85 ? "var(--go)" : pct >= 70 ? "var(--hold)" : "var(--recall)");
const radius = (s: MapSite) => 2.5 + Math.sqrt(s.anomalies) * 1.2; // area grows with anomaly count, so WP05's 8 does not swallow its neighbors
// note: WP04 and WP05 sit 4.5 map units apart in the kit, so their circles merged into one blob. Draw them nudged apart (display only; data coords unchanged).
const NUDGE: Record<string, [number, number]> = { WP04: [-0.5, 1.2], WP05: [-4.6, 4.7] };
const pos = (s: MapSite) => ({ x: s.x + (NUDGE[s.id]?.[0] ?? 0), y: s.y + (NUDGE[s.id]?.[1] ?? 0) });
const DOTS = Array.from({ length: 11 }, (_, i) => i * 10);

/**
 * Two-floor waypoint map. Circle color = inspection success, size = anomaly count.
 * Optional `route` draws a mission path; `spot` marks where Spot is now; `outdoor` waypoints get a dashed ring.
 */
export function FacilityMap({
  sites,
  route,
  spot,
  outdoor = [],
  dock,
  className,
}: {
  sites: MapSite[];
  route?: string[];
  spot?: string;
  outdoor?: string[];
  dock?: string;
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
              {sites
                .filter((s) => s.floor === floor)
                .map((s) => {
                  const pct = s.total ? Math.round((100 * s.ok) / s.total) : 100;
                  const { x, y } = pos(s);
                  const r = radius(s);
                  return (
                    <a
                      key={s.id}
                      href={`/waypoints/${s.id}`}
                      aria-label={`${s.id} ${s.name}: ${pct}% inspections OK, ${s.anomalies} anomalies`}
                      className="focus-visible:outline-none [&:focus-visible>circle]:stroke-foreground [&:hover>circle]:fill-opacity-45"
                    >
                      <title>{`${s.id} ${s.name}: ${pct}% inspections OK (${s.ok}/${s.total}), ${s.anomalies} anomalies`}</title>
                      {outdoor.includes(s.id) && <circle cx={x} cy={y} r={r + 3} fill="none" stroke="#7ec4ff" strokeDasharray="1.5 1.5" strokeWidth="0.6" />}
                      <circle cx={x} cy={y} r={r} fill={tone(pct)} fillOpacity={0.22} stroke={tone(pct)} strokeWidth="0.8" className="transition-[fill-opacity]" />
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
      <p className="col-span-2 text-xs text-helper">
        Color = share of inspections OK there (green ≥ 85%, yellow ≥ 70%, red below). Size = anomaly count.
        {outdoor.length > 0 && " Dashed ring = outdoor leg (assumed)."}
      </p>
    </div>
  );
}
