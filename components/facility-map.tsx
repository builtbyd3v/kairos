import { cn } from "@/lib/utils";

export type MapSite = { id: string; name: string; floor: number; x: number; y: number; ok: number; total: number; anomalies: number };

const tone = (pct: number) => (pct >= 85 ? "var(--go)" : pct >= 70 ? "var(--hold)" : "var(--recall)");

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
            <svg viewBox="-6 -6 112 112" className="w-full rounded-lg bg-[#0e1319] ring-1 ring-border" role="img" aria-label={`Floor ${floor} map`}>
              {[20, 40, 60, 80].map((g) => (
                <g key={g} stroke="#1f2a36" strokeWidth="0.3">
                  <line x1={g} y1="0" x2={g} y2="100" />
                  <line x1="0" y1={g} x2="100" y2={g} />
                </g>
              ))}
              {path.length > 1 && <polyline points={path.map((s) => `${s.x},${s.y}`).join(" ")} fill="none" stroke="#4f9fe8" strokeWidth="0.8" strokeOpacity="0.8" />}
              {sites
                .filter((s) => s.floor === floor)
                .map((s) => {
                  const pct = s.total ? Math.round((100 * s.ok) / s.total) : 100;
                  return (
                    <g key={s.id}>
                      <title>{`${s.id} ${s.name}: ${pct}% inspections OK (${s.ok}/${s.total}), ${s.anomalies} anomalies`}</title>
                      {outdoor.includes(s.id) && <circle cx={s.x} cy={s.y} r={6.5 + s.anomalies * 0.8} fill="none" stroke="#7ec4ff" strokeDasharray="1.5 1.5" strokeWidth="0.6" />}
                      <circle cx={s.x} cy={s.y} r={3.5 + s.anomalies * 0.8} fill={tone(pct)} fillOpacity={0.22} stroke={tone(pct)} strokeWidth="0.8" />
                      <text x={s.x} y={s.y + 1.4} textAnchor="middle" fontSize="3.8" fontWeight="600" fill="#f4f4f4">
                        {s.id.slice(2)}
                      </text>
                      {dock === s.id && (
                        <text x={s.x} y={s.y - 6} textAnchor="middle" fontSize="3.2" fill="#c6c6c6">
                          DOCK
                        </text>
                      )}
                    </g>
                  );
                })}
              {spot && byId.get(spot)?.floor === floor && (
                <g>
                  <circle cx={byId.get(spot)!.x} cy={byId.get(spot)!.y} r="2.2" fill="#f4f4f4" stroke="#161616" strokeWidth="0.8" />
                  <text x={byId.get(spot)!.x + 3.5} y={byId.get(spot)!.y - 3} fontSize="3.6" fontWeight="600" fill="#f4f4f4">
                    SPOT
                  </text>
                </g>
              )}
            </svg>
            <figcaption className="mt-1 text-center text-xs text-muted-foreground">Floor {floor}</figcaption>
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
