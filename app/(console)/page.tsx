import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight } from "lucide-react";
import { loadKit } from "@/lib/kit";
import { PageHeader } from "@/components/page-header";
import { VerdictChip } from "@/components/status";
import { et, NextRound, planNextRound } from "@/components/next-round";
import { ActivityFeed } from "@/components/activity-feed";
import { WeatherBanner } from "@/components/weather-banner";
import { ReadinessForecast } from "@/components/readiness-forecast";
import { DockDoor } from "@/components/dock-door";
import { doorWeather } from "@/lib/door-rain";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  const now = new Date();
  const kit = await loadKit();
  const plan = await planNextRound(kit, now);

  return (
    <>
      <PageHeader
        title="Launch"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
            Next round {et(plan.start, { weekday: "short", hour: "numeric", minute: "2-digit" })} ET{" "}
            <VerdictChip verdict={plan.verdict} className={cn(plan.verdict === "RECALL" && "animate-pulse-soft")} />
          </span>
        }
        actions={
          <Button asChild size="lg">
            <Link href="/live">
              Watch the live round
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        }
      />
      <WeatherBanner />

      <main className="mx-auto max-w-[1440px] space-y-5 px-8 py-6">
        <DockDoor weather={doorWeather(plan.weather, now)} source="Open-Meteo 15-minute rain for the St. Lucie plant (CC BY 4.0) and the NWS forecast grid" />
        <div className="grid grid-cols-[minmax(0,1fr)_24rem] items-start gap-5">
          <div className="min-w-0 animate-rise space-y-5">
            <ReadinessForecast />
          </div>
          <aside aria-label="Next round and activity" className="space-y-5">
            <div className="animate-rise [--rise-delay:60ms]">
              <NextRound plan={plan} />
            </div>
            <div className="animate-rise [--rise-delay:120ms]">
              <Suspense fallback={<Card className="px-4 text-sm text-muted-foreground">Loading activity…</Card>}>
                <ActivityFeed now={now} />
              </Suspense>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
