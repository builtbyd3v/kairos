import { Suspense } from "react";
import { connection } from "next/server";
import { loadKit } from "@/lib/kit";
import { forecast } from "@/lib/forecast";
import { weatherNow } from "@/lib/scenario";
import { PageHeader } from "@/components/page-header";
import { NextRound, planNextRound } from "@/components/next-round";
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
  const { now } = await weatherNow();
  const kit = await loadKit();
  const plan = await planNextRound(kit, now);
  const { nextGo } = forecast(plan.weather, kit, now);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Spot is IP54: light rain is fine, harsh rain and storms are not. Kairos watches both, and water on the route."
      />
      <WeatherBanner />

      <main className="mx-auto max-w-[1440px] space-y-5 px-8 py-6">
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
