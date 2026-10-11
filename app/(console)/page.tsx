import { Suspense } from "react";
import { connection } from "next/server";
import { analyze, loadKit } from "@/lib/kit";
import { backtest } from "@/lib/backtest";
import { forecast } from "@/lib/forecast";
import { weatherNow } from "@/lib/scenario";
import { PageHeader } from "@/components/page-header";
import { et, NextRound, planNextRound } from "@/components/next-round";
import { VerdictChip } from "@/components/status";
import { decide } from "@/lib/verdict";
import { listDetections } from "@/lib/evidence";
import { WeatherBanner } from "@/components/weather-banner";
import { LiveRadar } from "@/components/weather-watch";
import { Ip54Panel } from "@/components/ip54-panel";
import { RouteWater } from "@/components/route-water";
import { Kpis, PlantMap, RoundHealth, SpotStrip } from "@/components/fleet";

export default function Dashboard() {
  return (
    <Suspense
      fallback={
        // Skeleton in the board's own shape, so the real cards stream into reserved space instead of pushing the page.
        <main aria-busy="true">
          <PageHeader title="Dashboard" subtitle="Loading weather, rounds and water…" />
          <div className="max-w-[1800px] space-y-4 px-8 py-4 *:animate-pulse *:rounded-2xl *:bg-card motion-reduce:*:animate-none">
            <div className="h-7 max-w-2xl" />
            <div className="h-19" />
            <div className="h-26" />
            <div className="h-[48rem]" />
          </div>
        </main>
      }
    >
      <Board />
    </Suspense>
  );
}

// note: Orbit already shows anomalies, missions and insights in full. This page leads with what Kairos adds
// (in-route weather, water on the route, the next round's call) and sums up the kit's round health, which NextEra's brief asks for.
async function Board() {
  await connection();
  const { now, weather } = await weatherNow();
  const kit = await loadKit();
  const plan = await planNextRound(kit, now);
  const { nextGo } = forecast(plan.weather, kit, now);
  const a = analyze(kit);
  const bt = backtest(kit);
  const weatherHolds = { held: bt.filter((r) => r.verdict !== "GO" && r.reason && !r.reason.startsWith("Spot would dock")).length, of: bt.length };
  // One plain sentence: what Kairos is telling the operator right now (weather for a Spot on route, then water).
  const { verdict: onRoute, reasons } = decide(weather, { outdoor: true, batteryPct: 100, projectedEndPct: 100, routeRisk: [] }, { now, start: now, end: new Date(now.getTime() + 30 * 60000) }, true);
  const water = (await listDetections(20)).filter((d) => !d.frame_uri.startsWith("/inspections/"));
  const waiting = water.find((d) => d.label === null);
  const hazard = water.find((d) => d.label === "confirm");
  // Name the cause, so RECALL at 0.1 mm/h reads as "thunder", not as a contradiction with the rain chart.
  const cause = reasons.find((r) => r.verdict === onRoute)?.text.split(";")[0];
  const weatherLine =
    onRoute === "RECALL" ? `${cause ?? "Harsh weather"}: bring any Spot on route home.` : onRoute === "HOLD" ? `${cause ?? "Weather is marginal for IP54"}: hold Spot where it is.` : "Weather is within Spot's IP54 limit.";
  const launchLine = plan.verdict !== "GO" && nextGo ? `Next safe launch ${et(nextGo, { hour: "numeric", minute: "2-digit" })} ET.` : "";
  const waterLine = waiting ? `Water at ${waiting.waypoint ?? "the route"} needs an operator.` : hazard ? `Water hazard marked at ${hazard.waypoint ?? "the route"}.` : "Route dry.";

  return (
    <main>
      <PageHeader
        title="Dashboard"
        subtitle="Spot is IP54: light rain is fine, harsh rain and storms are not. Kairos watches both, and water on the route."
      />
      <WeatherBanner />

      <div className="max-w-[1800px] space-y-4 px-8 py-4">
        <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-lg xl:text-base 3xl:text-lg">
          <VerdictChip verdict={onRoute} />
          <span>{weatherLine}</span>
          {launchLine && <span className="text-muted-foreground">{launchLine}</span>}
          <span className="text-muted-foreground">{waterLine}</span>
        </p>
        <SpotStrip kit={kit} a={a} />
        <Kpis a={a} water={water} weatherHolds={weatherHolds} />
        {/* DOM order is the story (weather: IP54, next round, radar; then plant map, water, round health), so phones read it top to bottom.
            Laptop (xl): rows of wide | narrow, each row's cards stretch to the same height. Wide desktop (1800+): two rows of four columns. */}
        <div className="grid gap-4 *:flex *:flex-col *:*:flex-1 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] 3xl:grid-cols-4">
          <div className="3xl:col-span-2">
            <Ip54Panel />
          </div>
          <div>
            <NextRound plan={plan} strip={false} nextGo={nextGo} />
          </div>
          <div className="xl:col-start-2 xl:row-start-2 3xl:col-start-4 3xl:row-start-1">
            <LiveRadar />
          </div>
          <div className="xl:col-start-1 xl:row-start-2 3xl:col-span-2">
            <PlantMap kit={kit} a={a} water={water} weather={onRoute} />
          </div>
          <div className="xl:col-start-1 xl:row-start-3 3xl:col-start-3 3xl:row-start-2">
            <RouteWater />
          </div>
          <div className="xl:col-start-2 xl:row-start-3 3xl:col-start-4 3xl:row-start-2">
            <RoundHealth a={a} />
          </div>
        </div>
      </div>
    </main>
  );
}
