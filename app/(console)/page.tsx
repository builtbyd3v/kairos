import { Suspense } from "react";
import { connection } from "next/server";
import { loadKit } from "@/lib/kit";
import { forecast } from "@/lib/forecast";
import { weatherNow } from "@/lib/scenario";
import { PageHeader } from "@/components/page-header";
import { VerdictChip } from "@/components/status";
import { et, NextRound, planNextRound } from "@/components/next-round";
import { WeatherBanner } from "@/components/weather-banner";
import { ReadinessForecast } from "@/components/readiness-forecast";
import { RouteWeatherCard } from "@/components/weather-watch";
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
        subtitle="Kairos watches two things on every Spot round: the weather and water on the route."
      />
      <WeatherBanner />

      <main className="mx-auto max-w-[1440px] space-y-5 px-8 py-6">
        {/* Two things Kairos watches on every round: weather and water. */}
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <RouteWeatherCard />
          <RouteWater />
        </div>
        <details className="group rounded-2xl bg-card ring-1 ring-white/[0.06]">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-5 py-4 text-sm">
            <span className="font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">Next round</span>
            <span>{et(plan.start, { weekday: "short", hour: "numeric", minute: "2-digit" })} ET</span>
            <VerdictChip verdict={plan.verdict} />
            {plan.verdict !== "GO" && nextGo && <span className="text-muted-foreground">· next safe launch {et(nextGo, { hour: "numeric", minute: "2-digit" })} ET</span>}
            <span className="ml-auto text-xs text-helper group-open:hidden">Details</span>
          </summary>
          <div className="grid items-start gap-5 p-5 pt-0 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <NextRound plan={plan} strip={false} nextGo={nextGo} />
            <ReadinessForecast />
          </div>
        </details>
      </main>
    </>
  );
}
