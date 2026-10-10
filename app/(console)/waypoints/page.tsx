import Link from "next/link";
import { analyze, loadKit, pct } from "@/lib/kit";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const label = (s: string) => s.replaceAll("_", " ").toLowerCase();

// Same thresholds as the facility map: green >= 85%, yellow >= 70%, red below.
const toneBar = (p: number) =>
  p >= 85 ? "[&::-webkit-progress-value]:bg-go [&::-moz-progress-bar]:bg-go" : p >= 70 ? "[&::-webkit-progress-value]:bg-hold [&::-moz-progress-bar]:bg-hold" : "[&::-webkit-progress-value]:bg-recall [&::-moz-progress-bar]:bg-recall";
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
        {sites.map((s) => {
          const p = pct(s.ok, s.total);
          const worst = topFailure(kit.actions.filter((a) => a.locationId === s.id && !a.ok).map((a) => a.failureType));
          return (
            <Link key={s.id} href={`/waypoints/${s.id}`} className="rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
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
                      <span className="text-[11px] tracking-wider text-helper uppercase">Inspections OK</span>
                      <span className={cn("font-mono font-medium tabular-nums", toneText(p))}>{p}%</span>
                    </div>
                    <progress
                      value={s.ok}
                      max={s.total}
                      aria-label={`${s.id} inspection success`}
                      className={cn("mt-1 h-1.5 w-full appearance-none overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-secondary", toneBar(p))}
                    />
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
