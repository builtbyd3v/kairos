import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { CloudLightning, Thermometer, Wind } from "lucide-react";
import { analyze, loadKit, pct, type Kit } from "@/lib/kit";
import { decide, ORBIT_CALL } from "@/lib/verdict";
import { getLiveWeather, SITE } from "@/lib/weather";
import { logDecision, recentDecisions } from "@/lib/decisions";
import { DOCK, drainPerMin, isOutdoor, OUTDOOR_WAYPOINTS, routeOf } from "@/lib/route";
import { backtest } from "@/lib/backtest";
import { ReasonList, SEVERITY_UI, TRUTH_UI, VerdictBlock, VerdictChip } from "@/components/status";
import { FacilityMap } from "@/components/facility-map";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const fmtTime = (iso: string) => iso.replace("T", " ").slice(5, 16);
const et = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleString("en-US", { timeZone: "America/New_York", ...opts });

export default async function Board() {
  const kit = await loadKit();
  const a = analyze(kit);
  const bt = backtest(kit);
  const heldWeather = bt.filter((r) => r.verdict !== "GO" && r.reason && !r.reason.startsWith("Spot would dock"));
  const heldBattery = bt.filter((r) => r.reason?.startsWith("Spot would dock"));

  return (
    <div className="min-h-screen">
      <main className="mx-auto grid max-w-[1440px] grid-cols-12 gap-5 px-6 py-5">
        <Suspense fallback={<Card className="col-span-8">Checking weather…</Card>}>
          <NextRound kit={kit} />
        </Suspense>

        <section aria-label="What mission status hides" className="col-span-4 grid grid-cols-2 gap-3">
          <Stat value={`${a.totals.reportedCompleted}/${a.totals.missions}`} label="Missions report COMPLETED" note="What the robot says" />
          <Stat value={`${a.totals.clean}/${a.totals.missions}`} label="Missions actually clean" note="No failed inspections or serious anomalies" tone="hold" />
          <Stat value={String(a.totals.hiddenFailures)} label="Failed inspections hidden in COMPLETED missions" note="Invisible in mission status" tone="recall" />
          <Stat value={`${a.totals.seriousHidden}/${a.totals.serious}`} label="Serious anomalies inside COMPLETED missions" note="HIGH or CRITICAL severity" tone="recall" />
        </section>

        <Card className="col-span-7">
          <CardHeader>
            <CardTitle>Attention queue</CardTitle>
            <CardDescription>Anomalies ranked by severity, then how critical the asset is</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="divide-y divide-border">
              {a.queue.slice(0, 8).map((q, i) => (
                <li key={q.id}>
                  <Link href={`/missions/${q.missionId}`} className="flex items-center gap-3 py-2 text-sm hover:bg-secondary/50 focus-visible:outline-2 focus-visible:outline-link">
                    <span className="w-4 text-right font-mono text-xs text-helper">{i + 1}</span>
                    <span className={cn("w-[4.5rem] rounded px-1.5 py-0.5 text-center text-xs font-medium ring-1", SEVERITY_UI[q.severity])}>{q.severity}</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium capitalize">{q.type.replaceAll("_", " ").toLowerCase()}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {q.assetName} · {q.criticality.toLowerCase()} criticality · {q.locationName}
                      </span>
                    </span>
                    {q.hidden && <span className="rounded bg-hold/10 px-1.5 py-0.5 text-xs text-hold ring-1 ring-hold/30">Hidden in COMPLETED</span>}
                    <span className="w-28 text-right font-mono text-xs text-helper">
                      {q.missionId} · {fmtTime(q.timestamp)}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card className="col-span-5">
          <CardHeader>
            <CardTitle>Facility map</CardTitle>
            <CardDescription>Where inspections fail. Hover a waypoint for details.</CardDescription>
          </CardHeader>
          <CardContent>
            <FacilityMap sites={a.sites} outdoor={[...OUTDOOR_WAYPOINTS]} dock={DOCK} />
          </CardContent>
        </Card>

        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Battery vs. inspection success</CardTitle>
            <CardDescription>V2 never ran below 40% battery, so part of its lead over V1 is battery, not configuration</CardDescription>
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

        <Card className="col-span-4">
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

        <Card className="col-span-4">
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

        <Card className="col-span-12">
          <CardHeader>
            <CardTitle>Missions</CardTitle>
            <CardDescription>Reported status next to what happened inside each mission. Open a mission for its timeline.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mission</TableHead>
                  <TableHead>Start (kit time)</TableHead>
                  <TableHead>Config</TableHead>
                  <TableHead>Reported</TableHead>
                  <TableHead>Actually</TableHead>
                  <TableHead className="text-right">Failed actions</TableHead>
                  <TableHead className="text-right">Anomalies</TableHead>
                  <TableHead className="text-right">Battery</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...a.missionRows].reverse().map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Link href={`/missions/${m.id}`} className="font-mono text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-link">
                        {m.id}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{fmtTime(m.start)}</TableCell>
                    <TableCell>{m.config}</TableCell>
                    <TableCell>{m.status}</TableCell>
                    <TableCell className={cn("font-medium", TRUTH_UI[m.truth].text)}>{TRUTH_UI[m.truth].label}</TableCell>
                    <TableCell className="text-right font-mono">
                      {m.failed}/{m.actions}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {m.anomalies}
                      {m.serious > 0 && <span className="text-recall"> ({m.serious} serious)</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {m.startBattery}% → {m.endBattery}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
      </main>
    </div>
  );
}

// Rounds launch at 02:00, 10:00 and 18:00 plant time, as in the kit's mission schedule.
function nextRoundStart(now: Date): Date {
  const wall = new Date(et(now, {}));
  const offset = now.getTime() - wall.getTime();
  for (let day = 0; day < 2; day++) {
    for (const hour of [2, 10, 18]) {
      const c = new Date(wall);
      c.setDate(c.getDate() + day);
      c.setHours(hour, 0, 0, 0);
      if (c > wall) return new Date(c.getTime() + offset);
    }
  }
  throw new Error("unreachable");
}

async function NextRound({ kit }: { kit: Kit }) {
  await connection();
  const now = new Date();
  const weather = await getLiveWeather();

  // note: the next round repeats the latest kit route and starts at that mission's battery; the kit has no live telemetry.
  const last = kit.missions.at(-1)!;
  const route = routeOf(kit, last.id);
  const minutes = last.durationMin;
  const start = nextRoundStart(now);
  const end = new Date(start.getTime() + minutes * 60000);
  const drain = drainPerMin(kit, last.config);
  const a = analyze(kit);
  const routeRisk = a.sites
    .filter((s) => route.includes(s.id))
    .map((s) => ({ locationId: s.id, name: s.name, successPct: pct(s.ok, s.total) }))
    .sort((x, y) => x.successPct - y.successPct)
    .slice(0, 2);
  const health = { outdoor: isOutdoor(route), batteryPct: last.startBattery, projectedEndPct: last.startBattery - drain * minutes, routeRisk };
  const { verdict, reasons } = decide(weather, health, { now, start, end }, false);

  return (
    <Card className="col-span-8">
      <CardHeader>
        <CardTitle>Next round</CardTitle>
        <CardDescription>
          Launches {et(start, { weekday: "short", hour: "numeric", minute: "2-digit" })} ET · route of {last.id} ({route.length} stops,{" "}
          {health.outdoor ? "includes the outdoor leg at WP01" : "indoors only"}) · back on the dock about {minutes} min later at ~{Math.round(health.projectedEndPct)}% battery
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-[15rem_1fr] gap-6">
        <div className="space-y-3">
          <VerdictBlock verdict={verdict} caption={verdict === "GO" ? "Safe to launch on schedule" : verdict === "HOLD" ? "Do not launch yet" : "Bring Spot back now"} />
          <form action={logDecision} className="flex flex-wrap gap-2">
            <input type="hidden" name="verdict" value={verdict} />
            <input type="hidden" name="source" value="live" />
            <input type="hidden" name="missionId" value={last.id} />
            <input type="hidden" name="reasons" value={JSON.stringify(reasons)} />
            <Button name="action" value="confirmed">
              Confirm {verdict}
            </Button>
            {verdict !== "GO" && (
              <Button name="action" value="overridden" variant="outline">
                Override, launch anyway
              </Button>
            )}
          </form>
          {ORBIT_CALL[verdict] && <p className="text-xs text-helper">On confirm: {ORBIT_CALL[verdict]} (simulated)</p>}
        </div>
        <div className="space-y-4">
          <ReasonList reasons={reasons} />
          <WeatherStrip weather={weather} />
        </div>
      </CardContent>
    </Card>
  );
}

function WeatherStrip({ weather }: { weather: Awaited<ReturnType<typeof getLiveWeather>> }) {
  if (!weather) return <p className="text-sm text-hold">Live weather is unavailable, so outdoor rounds hold until it returns.</p>;
  const hourly = weather.steps.filter((s) => s.tempC !== null).slice(0, 12);
  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">
        Live · {SITE.name} · NWS + Open-Meteo · updated {et(new Date(weather.fetchedAt), { hour: "numeric", minute: "2-digit" })} ET
        {weather.alerts.length > 0 && <> · active: {weather.alerts.join(", ")}</>}
      </p>
      <div className="grid grid-cols-12 gap-1 text-center text-xs">
        {hourly.map((s) => (
          <div key={s.time} className="rounded bg-secondary/60 px-1 py-1.5">
            <div className="text-muted-foreground">{et(new Date(s.time), { hour: "numeric" })}</div>
            <div className="flex items-center justify-center gap-0.5 font-medium">
              <Thermometer aria-hidden className="size-3 text-helper" />
              {s.tempC === null ? "-" : `${Math.round(s.tempC)}°`}
            </div>
            <div className="flex items-center justify-center gap-0.5 text-muted-foreground">
              <CloudLightning aria-label="thunder chance" className="size-3" />
              {s.thunderPct ?? "-"}%
            </div>
            <div className="flex items-center justify-center gap-0.5 text-muted-foreground">
              <Wind aria-label="gust" className="size-3" />
              {s.gustKmh === null ? "-" : Math.round(s.gustKmh)}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-helper">Temperature °C · thunder chance · gusts km/h</p>
    </div>
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

function Stat({ value, label, note, tone }: { value: string; label: string; note: string; tone?: "hold" | "recall" }) {
  return (
    <div className={cn("rounded border border-border border-b-4 bg-card p-4", tone === "recall" ? "border-b-recall" : tone === "hold" ? "border-b-hold" : "border-b-info")}>
      <p className="font-mono text-3xl font-medium">{value}</p>
      <p className="mt-1 text-sm leading-snug">{label}</p>
      <p className="text-xs text-helper">{note}</p>
    </div>
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
