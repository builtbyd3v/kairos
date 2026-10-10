import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight } from "lucide-react";
import { analyze, loadKit, pct } from "@/lib/kit";
import { currentReviews } from "@/lib/reviews";
import { PageHeader } from "@/components/page-header";
import { VerdictChip } from "@/components/status";
import { et, NextRound, planNextRound } from "@/components/next-round";
import { inboxCounts, pgDate, toTab, TriageInbox } from "@/components/triage-inbox";
import { ActivityFeed } from "@/components/activity-feed";
import { WeatherBanner } from "@/components/weather-banner";
import { ReadinessForecast } from "@/components/readiness-forecast";
import { ShiftBrief } from "@/components/shift-brief";
import { SparkBars } from "@/components/spark-bars";
import { RoundsChart } from "@/components/rounds-chart";
import { Button } from "@/components/ui/button";
import { Card, CardFooter } from "@/components/ui/card";
import { CountUp } from "@/components/count-up";
import { cn } from "@/lib/utils";

export default function Today({ searchParams }: PageProps<"/">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Today" subtitle="Loading what needs you…" />
          <p className="px-8 py-6 text-sm text-muted-foreground">Loading anomalies and the next round…</p>
        </>
      }
    >
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  await connection();
  const now = new Date();
  const kit = await loadKit();
  const [reviews, plan, { tab }] = await Promise.all([currentReviews(), planNextRound(kit, now), searchParams]);
  const a = analyze(kit);
  const counts = inboxCounts(kit, reviews);
  const today = et(now, { dateStyle: "short" });
  const triagedToday = Object.values(reviews).filter((r) => et(pgDate(r.created_at), { dateStyle: "short" }) === today).length;
  const [v1, v2] = a.configs.map((c) => pct(c.ok, c.total));
  const hour = Number(et(now, { hour: "numeric", hourCycle: "h23" }));
  const greeting = hour >= 5 && hour < 12 ? "Good morning" : hour >= 12 && hour < 17 ? "Good afternoon" : "Good evening";

  // KPI sparkbars: one bar per kit day, mission, or the last 7 ET days, oldest to newest.
  const kitDays = [...new Set(a.missionRows.map((m) => m.start.slice(0, 10)))].sort();
  const completedPerDay = kitDays.map((d) => a.missionRows.filter((m) => m.start.startsWith(d) && m.status === "COMPLETED").length);
  const openPerMission = a.missionRows.map((m) => kit.anomalies.filter((x) => x.missionId === m.id && x.reviewRequired && !reviews[x.id]).length);
  const last7 = Array.from({ length: 7 }, (_, i) => et(new Date(now.getTime() - (6 - i) * 864e5), { dateStyle: "short" }));
  const triagedPerDay = last7.map((d) => Object.values(reviews).filter((r) => et(pgDate(r.created_at), { dateStyle: "short" }) === d).length);
  const v2PerMission = a.missionRows.filter((m) => m.config === "V2").map((m) => pct(m.actions - m.failed, m.actions));

  return (
    <>
      <PageHeader
        title={greeting}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="tabular-nums">{counts.open}</span> {counts.open === 1 ? "anomaly needs" : "anomalies need"} you · next round{" "}
            {et(plan.start, { weekday: "short", hour: "numeric", minute: "2-digit" })} ET <VerdictChip verdict={plan.verdict} className={cn(plan.verdict === "RECALL" && "animate-pulse-soft")} />
          </span>
        }
        actions={
          <Button asChild size="lg">
            <Link href="/anomalies">
              {counts.open > 0 ? `Review ${counts.open} ${counts.open === 1 ? "anomaly" : "anomalies"}` : "Open anomalies"}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        }
      />
      <WeatherBanner />

      <main className="mx-auto max-w-[1440px] space-y-5 px-8 py-6">
        {/* Cards rise in on load, 60 ms apart (animate-rise + --rise-delay in globals.css). */}
        <div className="keep-grid grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-4">
          <Kpi className="[--rise-delay:0ms]" label="Missions reported COMPLETED" value={<><CountUp value={a.totals.reportedCompleted} /><span className="text-muted-foreground">/{a.totals.missions}</span></>} note={`${a.totals.clean} actually clean`} tone="text-hold"
            spark={<SparkBars values={completedPerDay} label="Missions reported COMPLETED per kit day, oldest to newest" />}
          />
          <Kpi className="[--rise-delay:60ms]" label="Failed inspections hidden in COMPLETED" value={<CountUp value={a.totals.hiddenFailures} />} note="Invisible in mission status" tone="text-recall"
            spark={<SparkBars values={a.missionRows.map((m) => m.failed)} highlight={(v) => v >= 3} label="Failed inspections per mission, oldest to newest" />}
          />
          <Kpi className="[--rise-delay:120ms]" label="Needs you" value={<CountUp value={counts.open} />} note={`${counts.critical} critical`} tone={counts.critical ? "text-recall" : "text-muted-foreground"}
            spark={<SparkBars values={openPerMission} label="Untriaged flagged anomalies per mission, oldest to newest" />}
          />
          <Kpi className="[--rise-delay:180ms]" label="Triaged today" value={<CountUp value={triagedToday} />} note={`${counts.ack + counts.closed} triaged in total`} tone="text-muted-foreground"
            spark={<SparkBars values={triagedPerDay} label="Anomalies triaged per day, last 7 days" />}
          />
          <Kpi className="[--rise-delay:240ms]" label="Action success, V2" value={<><CountUp value={v2} />%</>} note={`V1 was ${v1}%, ${v2 - v1 >= 0 ? "+" : ""}${v2 - v1} pts`} tone={v2 >= v1 ? "text-go" : "text-recall"}
            spark={<SparkBars values={v2PerMission} highlight={(v) => v < v1} label={`Action success per V2 mission, oldest to newest; red is below the V1 rate of ${v1}%`} />}
          />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_24rem] items-start gap-5">
          <div className="min-w-0 space-y-5">
            <div className="animate-rise [--rise-delay:300ms]">
              <ReadinessForecast />
            </div>
            <div className="animate-rise [--rise-delay:360ms]">
              <TriageInbox kit={kit} reviews={reviews} tab={toTab(tab)} basePath="/" limit={6} />
            </div>
          </div>
          <aside aria-label="Next round and activity" className="space-y-5">
            <div className="animate-rise [--rise-delay:300ms]">
              <NextRound plan={plan} />
            </div>
            <div className="animate-rise [--rise-delay:360ms]">
              <RoundsChart rows={a.missionRows} />
            </div>
            <div className="animate-rise [--rise-delay:420ms]">
              <ShiftBrief kit={kit} reviews={reviews} plan={plan} />
            </div>
            <div className="animate-rise [--rise-delay:480ms]">
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

/** KPI tile: caps label, big mono number with sparkbars at the right, then a footer row with the delta. */
function Kpi({ label, value, note, tone, spark, className }: { label: string; value: React.ReactNode; note: string; tone: string; spark: React.ReactNode; className: string }) {
  return (
    <Card className={cn("animate-rise gap-0 py-0", className)}>
      <div className="flex flex-1 flex-col px-4 pt-3.5 pb-3">
        <p className="label-caps min-h-8">{label}</p>
        <div className="mt-2 flex items-end justify-between gap-2">
          <p className="font-mono text-[28px] leading-none font-medium">{value}</p>
          {spark}
        </div>
      </div>
      <CardFooter className={tone}>{note}</CardFooter>
    </Card>
  );
}
