import type { CSSProperties } from "react";
import Link from "next/link";
import { analyze, loadKit, pct } from "@/lib/kit";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const label = (s: string) => s.replaceAll("_", " ").toLowerCase();

// Same thresholds as the facility map: green >= 85%, yellow >= 70%, red below.
const toneFill = (p: number) => (p >= 85 ? "fill-go" : p >= 70 ? "fill-hold" : "fill-recall");
const CELLS = 20; // one cell = 5 percentage points
const toneText = (p: number) => (p >= 85 ? "text-go" : p >= 70 ? "text-hold" : "text-recall");

/** Most frequent failure type among these actions, or undefined if none failed. */
function topFailure(failures: string[]) {
  const counts = new Map<string, number>();
  for (const f of failures) counts.set(f, (counts.get(f) ?? 0) + 1);
  return [...counts].sort((x, y) => y[1] - x[1])[0];
}

export default async function WaypointsPage() {
  const kit = await loadKit();
  const sites = analyze(kit).sites.sort((x, y) => x.ok / x.total - y.ok / y.total);

  return (
    <main>
      <PageHeader title="Waypoints" subtitle="Where inspections happen, worst success rate first. Answers: are failures concentrated at certain locations?" />
      <div className="grid grid-cols-3 gap-5 px-8 py-6 xl:grid-cols-5">
        {sites.map((s, i) => {
          const p = pct(s.ok, s.total);
          const worst = topFailure(kit.actions.filter((a) => a.locationId === s.id && !a.ok).map((a) => a.failureType));
          return (
            // note: per-card stagger is index-driven, so it rides a CSS var in style rather than a static class.
            <Link
              key={s.id}
              href={`/waypoints/${s.id}`}
              className="animate-rise rounded-2xl focus-visible:outline-2 focus-visible:outline-ring"
              style={{ "--rise-delay": `${i * 30}ms` } as CSSProperties}
            >
              <Card className="h-full transition-colors hover:bg-secondary">
                <CardHeader>
                  <CardTitle>
                    <span className="font-mono text-helper">{s.id}</span> {s.name}
                  </CardTitle>
                  <CardDescription className="capitalize">
                    {label(s.zone)} · floor {s.floor} · {label(s.environment)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <div className="flex items-baseline justify-between">
                      <span className="label-caps text-helper">Inspections OK</span>
                      <span className={cn("font-mono font-medium tabular-nums", toneText(p))}>{p}%</span>
                    </div>
                    <svg viewBox={`0 0 ${CELLS * 5} 6`} preserveAspectRatio="none" className="mt-1.5 h-2 w-full" role="img" aria-label={`${s.id} inspection success ${p}%`}>
                      {Array.from({ length: CELLS }, (_, c) => (
                        <rect key={c} x={c * 5} width={4} height={6} rx={1} className={c < Math.round((p / 100) * CELLS) ? toneFill(p) : "fill-white/[0.06]"} />
                      ))}
                    </svg>
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      {s.ok}/{s.total} actions
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Anomalies</span>
                    <span className="font-mono tabular-nums">{s.anomalies}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Top failure</span>
                    <span className="text-right capitalize">{worst ? `${label(worst[0])} (${worst[1]})` : "none"}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
