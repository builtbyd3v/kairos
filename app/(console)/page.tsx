import { Suspense } from "react";
import { connection } from "next/server";
import { loadKit } from "@/lib/kit";
import { forecast } from "@/lib/forecast";
import { weatherNow } from "@/lib/scenario";
import { PageHeader } from "@/components/page-header";
import { VerdictChip } from "@/components/status";
import { et, NextRound, planNextRound } from "@/components/next-round";
import { ActivityFeed } from "@/components/activity-feed";
import { WeatherBanner } from "@/components/weather-banner";
import { ReadinessForecast } from "@/components/readiness-forecast";
import { LiveRadar, WeatherWatch } from "@/components/weather-watch";
import { RouteWater } from "@/components/route-water";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
            Next round {et(plan.start, { weekday: "short", hour: "numeric", minute: "2-digit" })} ET{" "}
            <VerdictChip verdict={plan.verdict} className={cn(plan.verdict === "RECALL" && "animate-pulse-soft")} />
            {plan.verdict !== "GO" && nextGo && <> · next safe launch {et(nextGo, { weekday: "short", hour: "numeric", minute: "2-digit" })} ET</>}
          </span>
        }
      />
      <WeatherBanner />

      <main className="mx-auto max-w-[1440px] space-y-5 px-8 py-6">
        {/* In-route weather first: what happens to a Spot that is out right now. */}
        <WeatherWatch at="now" />
        <div className="grid gap-5 xl:grid-cols-3 [&>*]:h-full">
          <NextRound plan={plan} strip={false} nextGo={nextGo} />
          <LiveRadar />
          <RouteWater />
        </div>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] [&>*]:h-full">
          <ReadinessForecast />
          <Suspense fallback={<Card className="px-4 text-sm text-muted-foreground">Loading activity…</Card>}>
            <ActivityFeed now={now} />
          </Suspense>
        </div>
      </main>
    </>
  );
}
