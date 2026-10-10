import Link from "next/link";
import { Info, OctagonAlert, RotateCcw, TriangleAlert } from "lucide-react";
import { analyze, type Kit } from "@/lib/kit";
import { reviewAnomaly, type Review } from "@/lib/reviews";
import { et } from "@/components/next-round";
import { pgDate } from "@/components/triage-inbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PRIORITY_UI = {
  P1: { Icon: OctagonAlert, className: "bg-recall/20 text-recall ring-recall/50" },
  P2: { Icon: TriangleAlert, className: "bg-hold/10 text-hold ring-hold/30" },
  P3: { Icon: Info, className: "bg-secondary text-muted-foreground ring-border" },
};

/** Current work orders (latest review = work_order), joined with the anomaly, asset and location, most urgent first. */
export function workOrders(kit: Kit, reviews: Record<string, Review>) {
  return analyze(kit)
    .queue.filter((q) => reviews[q.id]?.status === "work_order")
    .map((q) => ({
      ...q,
      wo: `WO-${q.id.slice(2)}`,
      priority: (q.severity === "CRITICAL" || q.criticality === "CRITICAL" ? "P1" : q.severity === "HIGH" ? "P2" : "P3") as keyof typeof PRIORITY_UI,
      created: pgDate(reviews[q.id].created_at),
    }))
    .sort((x, y) => x.priority.localeCompare(y.priority) || y.created.getTime() - x.created.getTime());
}

// note: same as the activity feed's `ago`; it is not exported there.
const ago = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

export function PriorityChip({ priority }: { priority: keyof typeof PRIORITY_UI }) {
  const { Icon, className } = PRIORITY_UI[priority];
  return (
    <span className={cn("inline-flex w-14 shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] font-medium ring-1", className)}>
      <Icon aria-hidden className="size-3" />
      {priority}
    </span>
  );
}

export function WorkOrderList({ kit, reviews, now }: { kit: Kit; reviews: Record<string, Review>; now: Date }) {
  const rows = workOrders(kit, reviews);
  if (rows.length === 0)
    return (
      <p className="animate-rise rounded-2xl bg-card px-5 py-10 text-center text-sm text-muted-foreground ring-1 ring-white/[0.06]">
        No work orders yet. Create one from an anomaly on{" "}
        <Link href="/" className="text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
          Today
        </Link>
        .
      </p>
    );

  return (
    <ul className="animate-rise divide-y divide-border/70 overflow-hidden rounded-2xl bg-card ring-1 ring-white/[0.06]">
      {rows.map((w) => (
        <li key={w.id} className="flex animate-row items-center gap-4 px-5 py-3.5 transition-colors hover:bg-white/[0.025]">
          <span className="w-16 shrink-0 font-mono text-sm tabular-nums">{w.wo}</span>
          <PriorityChip priority={w.priority} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium first-letter:uppercase">
              {w.type.replaceAll("_", " ").toLowerCase()} <span className="font-normal text-muted-foreground">· {w.severity.toLowerCase()} severity</span>
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {w.assetName} · {w.criticality.toLowerCase()} criticality · {w.locationName} · {w.id}
            </span>
          </span>
          <Link
            href={`/missions/${w.missionId}`}
            className="shrink-0 font-mono text-xs text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          >
            {w.missionId}
          </Link>
          <time dateTime={w.created.toISOString()} className="w-36 shrink-0 text-right text-xs">
            <span className="block">{ago(now.getTime() - w.created.getTime())}</span>
            <span className="block font-mono text-helper tabular-nums">{et(w.created, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET</span>
          </time>
          <form action={reviewAnomaly}>
            <input type="hidden" name="anomalyId" value={w.id} />
            <Button name="status" value="reopened" variant="outline" size="sm">
              <RotateCcw aria-hidden />
              Reopen
            </Button>
          </form>
        </li>
      ))}
    </ul>
  );
}
