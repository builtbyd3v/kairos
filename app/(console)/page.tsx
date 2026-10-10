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
import { Card } from "@/components/ui/card";
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

  return (
    <>
      <PageHeader
        title={greeting}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-1.5">
            <span className="tabular-nums">{counts.open}</span> {counts.open === 1 ? "anomaly needs" : "anomalies need"} you · next round{" "}
            {et(plan.start, { weekday: "short", hour: "numeric", minute: "2-digit" })} ET <VerdictChip verdict={plan.verdict} />
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

      <main className="mx-auto max-w-[1440px] space-y-6 px-8 py-6">
        <Card className="grid grid-cols-5 divide-x divide-border py-0">
          <Kpi label="Missions reported COMPLETED" value={`${a.totals.reportedCompleted}/${a.totals.missions}`} note={`${a.totals.clean} actually clean`} tone="text-hold" />
          <Kpi label="Failed inspections hidden in COMPLETED" value={String(a.totals.hiddenFailures)} note="Invisible in mission status" tone="text-recall"
            spark={<SparkBars values={a.missionRows.map((m) => m.failed)} highlight={(v) => v >= 3} label="Failed inspections per mission, oldest to newest" />}
          />
          <Kpi label="Needs you" value={String(counts.open)} note={`${counts.critical} critical`} tone={counts.critical ? "text-recall" : "text-muted-foreground"} />
          <Kpi label="Triaged today" value={String(triagedToday)} note={`${counts.ack + counts.closed} triaged in total`} tone="text-muted-foreground" />
          <Kpi label="Action success, V2" value={`${v2}%`} note={`V1 was ${v1}%, ${v2 - v1 >= 0 ? "+" : ""}${v2 - v1} pts`} tone={v2 >= v1 ? "text-go" : "text-recall"} />
        </Card>

        <div className="grid grid-cols-[minmax(0,1fr)_24rem] items-start gap-6">
          <div className="min-w-0 space-y-6">
            <ReadinessForecast />
            <TriageInbox kit={kit} reviews={reviews} tab={toTab(tab)} basePath="/" limit={6} />
          </div>
          <aside aria-label="Next round and activity" className="space-y-6">
            <NextRound plan={plan} />
            <RoundsChart rows={a.missionRows} />
            <ShiftBrief kit={kit} reviews={reviews} plan={plan} />
            <Suspense fallback={<Card className="px-4 text-sm text-muted-foreground">Loading activity…</Card>}>
              <ActivityFeed now={now} />
            </Suspense>
          </aside>
        </div>
      </main>
    </>
  );
}

function Kpi({ label, value, note, tone, spark }: { label: string; value: string; note: string; tone: string; spark?: React.ReactNode }) {
  return (
    <div className="px-5 py-4">
      <p className="text-[11px] font-medium tracking-wider text-helper uppercase">{label}</p>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <p className="font-mono text-[28px] leading-none font-medium tabular-nums">{value}</p>
        {spark}
      </div>
      <p className={cn("mt-1.5 text-xs", tone)}>{note}</p>
    </div>
  );
}
