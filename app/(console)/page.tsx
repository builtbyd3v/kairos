import { Suspense } from "react";
import { connection } from "next/server";
import { loadKit } from "@/lib/kit";
import { forecast } from "@/lib/forecast";
import { weatherNow } from "@/lib/scenario";
import { PageHeader } from "@/components/page-header";
import { VerdictChip } from "@/components/status";
import { et, NextRound, planNextRound, WeatherStrip } from "@/components/next-round";
import { ActivityFeed } from "@/components/activity-feed";
import { WeatherBanner } from "@/components/weather-banner";
import { ReadinessForecast } from "@/components/readiness-forecast";
import { DockDoor } from "@/components/dock-door";
import { LiveRadar } from "@/components/weather-watch";
import { doorWeather } from "@/lib/door-rain";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function Launch() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Launch" subtitle="Loading the next round…" />
          <p className="px-8 py-6 text-sm text-muted-foreground">Loading weather and Spot&apos;s health…</p>
        </>
      }
    >
      <Dashboard />
    </Suspense>
  );
}

// note: Orbit already shows anomalies, missions, insights and shift handoff. This page shows only what Kairos adds: weather + health before launch.
async function Dashboard() {
  await connection();
  const { now, scenario } = await weatherNow();
  const kit = await loadKit();
  const plan = await planNextRound(kit, now);
  const { nextGo } = forecast(plan.weather, kit, now);
  // The storm moment for the door: the heaviest rain step in the next 3 h of the forecast (or now if none).
  const stormStep = (plan.weather?.steps ?? [])
    .filter((st) => Date.parse(st.time) >= now.getTime() - 15 * 60000 && Date.parse(st.time) <= now.getTime() + 3 * 3600000)
    .reduce<{ time: string; precipMmPerHour: number | null } | null>((a, b) => ((b.precipMmPerHour ?? 0) > (a?.precipMmPerHour ?? 0) ? b : a), null);
  const stormAt = stormStep && (stormStep.precipMmPerHour ?? 0) > 0 ? new Date(stormStep.time) : now;

  return (
    <>
      <PageHeader
        title="Launch"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
            Can Spot go out? Next round {et(plan.start, { weekday: "short", hour: "numeric", minute: "2-digit" })} ET{" "}
            <VerdictChip verdict={plan.verdict} className={cn(plan.verdict === "RECALL" && "animate-pulse-soft")} />
            {plan.verdict !== "GO" && nextGo && <> · next safe launch {et(nextGo, { weekday: "short", hour: "numeric", minute: "2-digit" })} ET</>}
          </span>
        }
      />
      <WeatherBanner />

      <main className="mx-auto max-w-[1440px] space-y-5 px-8 py-6">
        {/* Rows of matching height, so card edges line up: decision, outlook, details. */}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] [&>*]:h-full">
          <DockDoor
            checks={[
              { label: et(stormAt, { hour: "numeric", minute: "2-digit" }), weather: doorWeather(plan.weather, stormAt) },
              ...(nextGo ? [{ label: et(nextGo, { hour: "numeric", minute: "2-digit" }), weather: doorWeather(plan.weather, nextGo) }] : []),
            ]}
            source="Open-Meteo 15-minute rain for the St. Lucie plant (CC BY 4.0) and the NWS forecast grid"
          />
          <NextRound plan={plan} strip={false} nextGo={nextGo} />
        </div>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] [&>*]:h-full">
          <ReadinessForecast />
          <LiveRadar />
        </div>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] [&>*]:h-full">
          <Card className="animate-rise">
            <CardHeader>
              <CardTitle>Next 12 hours</CardTitle>
            </CardHeader>
            <CardContent>
              <WeatherStrip weather={plan.weather} recorded={scenario === "recorded"} />
            </CardContent>
          </Card>
          <Suspense fallback={<Card className="px-4 text-sm text-muted-foreground">Loading activity…</Card>}>
            <ActivityFeed now={now} />
          </Suspense>
        </div>
      </main>
    </>
  );
}
