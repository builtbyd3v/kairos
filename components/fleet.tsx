import Link from "next/link";
import { ArrowRight, BatteryMedium, Dog, MapPin, Route } from "lucide-react";
import { analyze, pct, type Kit } from "@/lib/kit";
import { DOCK, OUTDOOR_WAYPOINTS, routeOf } from "@/lib/route";
import type { EvidenceRow } from "@/lib/evidence";
import type { Verdict } from "@/lib/verdict";
import { FacilityMap } from "@/components/facility-map";
import { SparkBars } from "@/components/spark-bars";
import { CountUp } from "@/components/count-up";
import { TRUTH_UI, VerdictChip } from "@/components/status";
import { Why } from "@/components/why";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Dashboard pieces built from NextEra's kit: Spot's latest round, the fleet KPIs, the plant map, and round health.
// note: the kit has one robot and no live telemetry, so "Spot now" is the latest kit round plus today's weather call.

type Analysis = ReturnType<typeof analyze>;

/** One row: which Spot, its latest round, true status, battery, and the call for a Spot on route right now. */
export function SpotStrip({ kit, a, now }: { kit: Kit; a: Analysis; now: Verdict }) {
  const last = a.missionRows.at(-1)!;
  const truth = TRUTH_UI[last.truth];
  const items = [
    { Icon: Route, label: "Latest round", value: `${last.id} · ${last.config}`, sub: `${last.start.replace("T", " ").slice(5, 16)} · ${last.durationMin} min` },
    { Icon: BatteryMedium, label: "Battery", value: `${last.startBattery}% → ${last.endBattery}%`, sub: `${last.startBattery - last.endBattery}% used this round` },
    { Icon: MapPin, label: "Route", value: `${routeOf(kit, last.id).length} stops`, sub: `docks at ${DOCK}` },
  ];
  return (
    <Card size="sm" className="animate-rise">
      <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
            <Dog aria-hidden className="size-5" />
          </span>
          <div className="leading-tight">
            <p className="font-semibold">SPOT-01</p>
            <p className="text-xs text-muted-foreground">St. Lucie demo site</p>
          </div>
        </div>
        <div>
          <p className="label-caps text-helper">On route now</p>
          <VerdictChip verdict={now} className="mt-1" />
        </div>
        <div>
          <p className="label-caps text-helper">True status</p>
          <p className={cn("mt-0.5 font-medium", truth.text)}>{truth.label}</p>
        </div>
        {items.map(({ Icon, label, value, sub }) => (
          <div key={label} className="flex items-start gap-2">
            <Icon aria-hidden className="mt-0.5 size-4 text-helper" />
            <div>
              <p className="label-caps text-helper">{label}</p>
              <p className="font-mono text-sm font-medium tabular-nums">{value}</p>
              <p className="text-xs text-muted-foreground">{sub}</p>
            </div>
          </div>
        ))}
        <p className="ml-auto self-end text-[11px] text-helper">Spot data: NextEra kit (synthetic)</p>
      </CardContent>
    </Card>
  );
}

const DELAYS = ["[--rise-delay:40ms]", "[--rise-delay:80ms]", "[--rise-delay:120ms]", "[--rise-delay:160ms]"];

/** Four KPI tiles: caps label, mono number, sparkbars, footer line (DESIGN.md). */
export function Kpis({ a, water, weatherHolds }: { a: Analysis; water: EvidenceRow[]; weatherHolds: { held: number; of: number } }) {
  const t = a.totals;
  const confirmed = water.filter((d) => d.label === "confirm").length;
  const waiting = water.filter((d) => d.label === null).length;
  const tiles = [
    {
      label: "Rounds logged",
      value: t.missions,
      foot: `${t.clean} clean · ${t.missions - t.clean} need a look`,
      spark: a.missionRows.map((m) => m.endBattery),
      hi: (v: number) => v < 20,
      sparkLabel: "Battery at the end of each round; red below 20%",
    },
    {
      label: "Hidden failures",
      value: t.hiddenFailures,
      foot: `failed actions inside ${t.reportedCompleted} "COMPLETED" rounds`,
      spark: a.missionRows.map((m) => m.failed),
      hi: (v: number) => v > 0,
      sparkLabel: "Failed actions per round",
      tone: "text-recall",
    },
    {
      label: "Water caught",
      value: water.length,
      foot: `${confirmed} confirmed · ${waiting} waiting on an operator`,
      spark: water.map((d) => Math.round(d.score * 100)).reverse(),
      hi: () => false,
      sparkLabel: "Model score of each water detection, oldest first",
    },
    {
      label: "Weather holds",
      value: weatherHolds.held,
      foot: `of ${weatherHolds.of} kit rounds, on archive weather: no crying wolf`,
      spark: [],
      hi: () => false,
      sparkLabel: "",
    },
  ];
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((k, i) => (
        <Card key={k.label} size="sm" className={cn("animate-rise", DELAYS[i])}>
          <CardHeader>
            <CardTitle>{k.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <div className="flex items-end justify-between gap-3">
              <span className={cn("font-mono text-[28px] leading-none font-semibold", k.tone)}>
                <CountUp value={k.value} />
              </span>
              {k.spark.length > 1 && <SparkBars values={k.spark} highlight={k.hi} label={k.sparkLabel} />}
            </div>
            <p className="text-xs text-muted-foreground">{k.foot}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** The plant on one screen: latest route, dock, outdoor leg (weather-gated), and every waypoint where Spot's camera found water. */
export function PlantMap({ kit, a, water, weather }: { kit: Kit; a: Analysis; water: EvidenceRow[]; weather: Verdict }) {
  const route = routeOf(kit, a.missionRows.at(-1)!.id);
  const wet = [...new Set(water.filter((d) => d.label !== "reject" && d.waypoint).map((d) => d.waypoint!))];
  return (
    <Card className="animate-rise [--rise-delay:120ms]">
      <CardHeader>
        <CardTitle>Plant map</CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-2">
          Latest route, water Spot found, and the outdoor leg weather gates
          <span className="inline-flex items-center gap-1.5 text-xs">
            Outdoor leg <VerdictChip verdict={weather} />
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FacilityMap sites={a.sites} route={route} outdoor={[...OUTDOOR_WAYPOINTS]} dock={DOCK} wet={wet} />
      </CardContent>
    </Card>
  );
}

/** NextEra's own question, answered from the kit: what the robot reported vs what actually happened. */
export function RoundHealth({ a }: { a: Analysis }) {
  const t = a.totals;
  const hot = [...a.sites].sort((x, y) => y.anomalies - x.anomalies)[0];
  const low = a.bands[0];
  const worst = a.byType[0];
  const rows = [
    {
      figure: `${t.hiddenFailures}`,
      title: `failed actions hide inside "COMPLETED" rounds`,
      meaning: `${t.seriousHidden} of ${t.serious} high or critical anomalies are in rounds Spot reported as done.`,
      href: "/missions",
    },
    {
      figure: hot.id,
      title: `${hot.name}: most anomalies (${hot.anomalies})`,
      meaning: `${pct(hot.ok, hot.total)}% of inspections there succeed. Check it first after a round.`,
      href: `/waypoints/${hot.id}`,
    },
    {
      figure: `${pct(low.all.ok, low.all.total)}%`,
      title: `inspection success below 20% battery`,
      meaning: "Kairos holds a round that would dock under 20%, the same way it holds for weather.",
      href: "/insights#battery-chart",
    },
    {
      figure: `${pct(worst.ok, worst.total)}%`,
      title: `${worst.type.replace("_INSPECTION", "").replaceAll("_", " ").toLowerCase()} inspections succeed`,
      meaning: "The least reliable inspection type in the kit.",
      href: "/insights",
    },
  ];
  return (
    <Card className="animate-rise [--rise-delay:180ms]">
      <CardHeader>
        <CardTitle>Round health</CardTitle>
        <CardDescription>What Spot reported vs what happened, across all {t.missions} kit rounds</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="panel-inset divide-y divide-border">
          {rows.map((r) => (
            <li key={r.title}>
              <Link href={r.href} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-ring">
                <span className="font-mono text-lg font-semibold text-hold tabular-nums">{r.figure}</span>
                <span>
                  <span className="block font-medium">{r.title}</span>
                  <span className="block text-xs text-muted-foreground">{r.meaning}</span>
                </span>
                <ArrowRight aria-hidden className="size-4 text-helper" />
              </Link>
            </li>
          ))}
        </ul>
        <Why label="How measured">
          Recomputed from NextEra&apos;s synthetic kit (missions, actions, anomalies) on every load. &quot;Hidden&quot; = a failed action or a high or critical anomaly inside a
          round whose status says COMPLETED. Kit dates: {t.range[0]?.slice(0, 10)} to {t.range[1]?.slice(0, 10)}.
        </Why>
      </CardContent>
    </Card>
  );
}
