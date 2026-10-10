import { Suspense } from "react";
import { connection } from "next/server";
import { loadKit } from "@/lib/kit";
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

export default function Dashboard() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Dashboard" subtitle="Loading weather, rounds and water…" />
          <p className="px-8 py-6 text-sm text-muted-foreground">Loading weather and Spot&apos;s health…</p>
        </>
      }
    >
      <Board />
    </Suspense>
  );
}

// note: Orbit already shows anomalies, missions, insights and shift handoff. This page shows what Kairos adds:
// in-route weather, water on the route, and the next round's call.
async function Board() {
  await connection();
  const { now, weather } = await weatherNow();
  const kit = await loadKit();
  const plan = await planNextRound(kit, now);
  const { nextGo } = forecast(plan.weather, kit, now);
  // One plain sentence: what Kairos is telling the operator right now (weather for a Spot on route, then water).
  const onRoute = decide(weather, { outdoor: true, batteryPct: 100, projectedEndPct: 100, routeRisk: [] }, { now, start: now, end: new Date(now.getTime() + 30 * 60000) }, true).verdict;
  const water = (await listDetections(20)).filter((d) => !d.frame_uri.startsWith("/inspections/"));
  const waiting = water.find((d) => d.label === null);
  const hazard = water.find((d) => d.label === "confirm");
  const weatherLine =
    onRoute === "RECALL" ? "Harsh weather over the plant: bring any Spot on route home." : onRoute === "HOLD" ? "Weather is marginal for IP54: hold Spot where it is." : "Weather is within Spot's IP54 limit.";
  const launchLine = plan.verdict !== "GO" && nextGo ? `Next safe launch ${et(nextGo, { hour: "numeric", minute: "2-digit" })} ET.` : "";
  const waterLine = waiting ? `Water at ${waiting.waypoint ?? "the route"} needs an operator.` : hazard ? `Water hazard marked at ${hazard.waypoint ?? "the route"}.` : "Route dry.";

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Spot is IP54: light rain is fine, harsh rain and storms are not. Kairos watches both, and water on the route."
      />
      <WeatherBanner />

      <main className="mx-auto max-w-[1440px] space-y-5 px-8 py-6">
        <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-lg">
          <VerdictChip verdict={onRoute} />
          <span>{weatherLine}</span>
          {launchLine && <span className="text-muted-foreground">{launchLine}</span>}
          <span className="text-muted-foreground">{waterLine}</span>
        </p>
        {/* Weather first: Spot is IP54, so harsh rain and storms are what stop it. Then water on the route. */}
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Ip54Panel />
          <LiveRadar />
        </div>
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <RouteWater />
          <NextRound plan={plan} strip={false} nextGo={nextGo} />
        </div>
      </main>
    </>
  );
}
