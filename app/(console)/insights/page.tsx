import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Suspense } from "react";
import { connection } from "next/server";
import { analyze, loadKit, pct } from "@/lib/kit";
import { SITE } from "@/lib/weather";
import { recentDecisions } from "@/lib/decisions";
import { DOCK, OUTDOOR_WAYPOINTS } from "@/lib/route";
import { backtest } from "@/lib/backtest";
import { parseEvents } from "@/lib/live";
import { dataTraps } from "@/lib/traps";
import { VerdictChip } from "@/components/status";
import { FacilityMap } from "@/components/facility-map";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// note: same replay file the live page reads, once per server start.
const EVENTS = parseEvents(readFileSync(join(process.cwd(), "data/kit/replay.ndjson"), "utf8"));

export default async function InsightsPage() {
  const kit = await loadKit();
  const a = analyze(kit);
  const bt = backtest(kit);
  const heldWeather = bt.filter((r) => r.verdict !== "GO" && r.reason && !r.reason.startsWith("Spot would dock"));
  const traps = dataTraps(kit, EVENTS);
  const heldBattery = bt.filter((r) => r.reason?.startsWith("Spot would dock"));

  return (
    <main>
      <PageHeader title="Insights" subtitle="Patterns across all 27 kit missions: where inspections fail, how battery and configuration matter, and how the dispatcher rules would have behaved on real weather." />
      <div className="grid grid-cols-12 gap-5 px-8 py-6">
        <Card className="col-span-12">
          <CardHeader>
            <CardTitle>Before you trust these charts</CardTitle>
            <CardDescription>Data traps in the kit. Each number is recomputed from the kit files on every load.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {traps.map((t) => (
                <li key={t.id} className="grid gap-x-4 gap-y-0.5 py-2.5 md:grid-cols-[10rem_1fr]">
                  <span className="font-mono text-sm font-medium text-hold">{t.figure}</span>
                  <div>
                    <p className="font-medium">
                      {t.title}
                      {t.id === "battery" && (
                        <a href="#battery-chart" className="ml-2 text-xs font-normal text-info underline-offset-2 hover:underline">
                          See the chart
                        </a>
                      )}
                    </p>
                    <p className="text-muted-foreground">{t.meaning}</p>
                    <p className="text-xs text-helper">Measured: {t.how}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="col-span-6">
          <CardHeader>
            <CardTitle>Facility map</CardTitle>
            <CardDescription>Where inspections fail. Hover a waypoint for details.</CardDescription>
          </CardHeader>
          <CardContent>
            <FacilityMap sites={a.sites} outdoor={[...OUTDOOR_WAYPOINTS]} dock={DOCK} />
          </CardContent>
        </Card>

        <Card id="battery-chart" className="col-span-6 scroll-mt-20">
          <CardHeader>
            <CardTitle>Battery vs. inspection success</CardTitle>
            <CardDescription>V2 never ran below 52% battery, so part of its lead over V1 is battery, not configuration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {a.bands.map((b) => (
              <div key={b.band} className="grid grid-cols-[4.5rem_1fr] items-center gap-3">
                <span className="font-mono text-xs text-muted-foreground">{b.band}</span>
                <div className="space-y-1">
                  <Bar label="V1" ok={b.v1.ok} total={b.v1.total} />
                  <Bar label="V2" ok={b.v2.ok} total={b.v2.total} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="col-span-6">
          <CardHeader>
            <CardTitle>Least reliable inspections</CardTitle>
            <CardDescription>Share of actions that succeeded, all 27 missions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {a.byType.map((t) => (
              <Bar key={t.type} label={t.type.replace("_INSPECTION", "").replace("_", " ").toLowerCase()} ok={t.ok} total={t.total} wide />
            ))}
            <dl className="grid grid-cols-2 gap-3 pt-2 text-sm">
              {a.configs.map((c) => (
                <div key={c.config} className="rounded bg-secondary/60 p-3">
                  <dt className="font-medium">Configuration {c.config}</dt>
                  <dd className="text-muted-foreground">
                    {pct(c.ok, c.total)}% actions OK · {c.avgDuration} min · {c.avgDrain}% battery per mission
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card className="col-span-6">
          <CardHeader>
            <CardTitle>Backtest: would it cry wolf?</CardTitle>
            <CardDescription>Today&apos;s rules run on the real archived weather at {SITE.name.split(" (")[0]} for each kit round time</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              <span className="font-mono text-3xl font-medium">{heldWeather.length}</span>
              <span className="text-muted-foreground"> of {bt.length} rounds held for weather</span>
            </p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {heldWeather.map((r) => (
                <li key={r.missionId}>
                  <span className="font-mono text-foreground">{r.missionId}</span> {r.reason}
                </li>
              ))}
            </ul>
            <p>
              <span className="font-mono text-3xl font-medium">{heldBattery.length}</span>
              <span className="text-muted-foreground"> of {bt.length} rounds held for battery (would dock under 20%)</span>
            </p>
            <p className="text-xs text-helper">
              {bt.filter((r) => r.outdoor).length} of {bt.length} routes include the outdoor leg. Weather: Open-Meteo ERA5 archive, Sep 1-10, 2026. The archive has
              no thunder data, so this count does not test the thunder rule.
            </p>
          </CardContent>
        </Card>

        <Suspense fallback={<Card className="col-span-12">Loading decisions…</Card>}>
          <DecisionLog />
        </Suspense>

        <footer className="col-span-12 space-y-1 pb-6 text-xs text-helper">
          <p>Mission data is NextEra&apos;s synthetic challenge kit: indoor facility, no weather fields. Kit times are shown as recorded.</p>
          <p>
            Assumptions: site is {SITE.name}; WP01&apos;s entrance apron is the outdoor leg; WP15 is the dock; kit x/y units are meters; Spot walks at 1 m/s;
            thresholds marked &quot;our assumption&quot; await NextEra&apos;s procedure limits. Orbit calls are simulated.
          </p>
        </footer>
      </div>
    </main>
  );
}

async function DecisionLog() {
  await connection();
  const rows = await recentDecisions();
  return (
    <Card className="col-span-12">
      <CardHeader>
        <CardTitle>Decision log</CardTitle>
        <CardDescription>Every confirm or override is stored in Neon with the reasons the operator saw</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No decisions yet. Confirm the next round above.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {rows.map((d) => (
              <li key={d.id} className="flex animate-row flex-wrap items-center gap-x-3 py-2">
                <span className="font-mono text-xs text-helper">{d.created_at.slice(5, 16)} UTC</span>
                <VerdictChip verdict={d.verdict} />
                <span className="capitalize">{d.operator_action}</span>
                <span className="rounded bg-secondary px-1.5 text-xs text-muted-foreground">{d.source}</span>
                <span className="text-muted-foreground">{d.reasons[0]?.text ?? "No limits close"}</span>
                {d.orbit_call && <span className="font-mono text-xs text-helper">→ {d.orbit_call}</span>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Bar({ label, ok, total, wide }: { label: string; ok: number; total: number; wide?: boolean }) {
  const p = pct(ok, total);
  return (
    <div className={cn("grid items-center gap-2", wide ? "grid-cols-[6rem_1fr_6.5rem]" : "grid-cols-[2rem_1fr_6.5rem]")}>
      <span className="text-xs capitalize text-muted-foreground">{label}</span>
      <progress
        value={ok}
        max={total || 1}
        aria-label={`${label}: ${p}% of ${total}`}
        className="h-2 w-full appearance-none overflow-hidden rounded [&::-moz-progress-bar]:bg-info [&::-webkit-progress-bar]:bg-secondary [&::-webkit-progress-value]:bg-info"
      />
      <span className="font-mono text-xs text-muted-foreground">{total ? `${p}% (${ok}/${total})` : "no runs"}</span>
    </div>
  );
}
