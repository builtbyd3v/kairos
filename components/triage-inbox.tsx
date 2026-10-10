import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, CircleAlert, Eye, Info, OctagonAlert, RotateCcw, TriangleAlert, Wrench, X } from "lucide-react";
import { analyze, pct, type Kit, type Severity } from "@/lib/kit";
import { reviewAnomaly, type Review, type ReviewStatus } from "@/lib/reviews";
import { SEVERITY_UI } from "@/components/status";
import { InspectionImage } from "@/components/inspection-image";
import { et } from "@/components/next-round";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const SEVERITY_ICON: Record<Severity, typeof Info> = { CRITICAL: OctagonAlert, HIGH: TriangleAlert, MEDIUM: CircleAlert, LOW: Info };

// Status is color + icon + word. Shared with the activity feed.
export const REVIEW_UI: Record<ReviewStatus, { Icon: typeof Info; label: string; className: string }> = {
  work_order: { Icon: Wrench, label: "Work order", className: "bg-primary/10 text-link ring-primary/40" },
  acknowledged: { Icon: Eye, label: "Acknowledged", className: "bg-go/10 text-go ring-go/40" },
  dismissed: { Icon: X, label: "Dismissed", className: "bg-secondary text-muted-foreground ring-border" },
  reopened: { Icon: RotateCcw, label: "Reopened", className: "bg-hold/10 text-hold ring-hold/30" },
};

const TABS = [
  { id: "open", label: "Needs you" },
  { id: "ack", label: "Acknowledged" },
  { id: "closed", label: "Closed" },
  // note: not in the brief. Without it, the 25 MEDIUM/LOW anomalies Spot did not flag for review would be invisible.
  { id: "monitor", label: "No review needed" },
] as const;
export type InboxTab = (typeof TABS)[number]["id"];
export const toTab = (v: unknown): InboxTab => TABS.find((t) => t.id === v)?.id ?? "open";

/** Postgres timestamptz text ("2026-10-10 07:38:53.7+00") to a Date. */
export const pgDate = (s: string) => new Date(s.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));

const human = (s: string) => s.replaceAll("_", " ").toLowerCase();
const kitTime = (iso: string) => iso.replace("T", " ").slice(5, 16);

type Bucket = InboxTab;
function bucketOf(reviewRequired: boolean, review: Review | undefined): Bucket {
  if (!review) return reviewRequired ? "open" : "monitor";
  return review.status === "acknowledged" ? "ack" : "closed";
}

/** Count anomalies per tab. Also used by page headers and KPIs so the numbers match. */
export function inboxCounts(kit: Kit, reviews: Record<string, Review>) {
  const counts: Record<Bucket, number> = { open: 0, ack: 0, closed: 0, monitor: 0 };
  let critical = 0;
  for (const a of kit.anomalies) {
    const b = bucketOf(a.reviewRequired, reviews[a.id]);
    counts[b]++;
    if (b === "open" && a.severity === "CRITICAL") critical++;
  }
  return { ...counts, critical };
}

type Props = { kit: Kit; reviews: Record<string, Review>; tab: InboxTab; basePath: "/" | "/anomalies"; limit?: number };

export function TriageInbox({ kit, reviews, tab, basePath, limit }: Props) {
  const a = analyze(kit);
  const counts = inboxCounts(kit, reviews);
  const rows = a.queue.filter((q) => bucketOf(q.reviewRequired, reviews[q.id]) === tab);
  const shown = limit ? rows.slice(0, limit) : rows;
  const actionById = new Map(kit.actions.map((x) => [x.id, x]));
  const siteById = new Map(a.sites.map((s) => [s.id, s]));

  return (
    <section aria-labelledby="inbox-title">
      <Card className="gap-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4">
          <h2 id="inbox-title" className="label-caps flex items-center gap-1.5">
            Anomaly triage
            <span title="Spot flags anomalies; you decide: work order, acknowledge or dismiss." className="text-helper">
              <Info aria-hidden className="size-3.5" />
            </span>
          </h2>
          {/* Segmented pill; the indicator slides to the active tab (tab-indicator in globals.css). */}
          <nav aria-label="Triage status" className="relative flex flex-wrap gap-1 rounded-full bg-panel p-1 ring-1 ring-white/[0.06] [anchor-scope:--tab]">
            <span aria-hidden className="tab-indicator rounded-full bg-secondary shadow-sm ring-1 ring-white/[0.08]" />
            {TABS.map((t) => (
              <Link
                key={t.id}
                href={t.id === "open" ? basePath : `${basePath}?tab=${t.id}`}
                scroll={false}
                aria-current={t.id === tab ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                  t.id === tab && "tab-anchor font-medium text-foreground",
                )}
              >
                {t.label}
                <span className={cn("rounded-full px-1.5 font-mono text-[11px] tabular-nums", t.id === "open" && counts.open > 0 ? "bg-recall font-medium text-background" : "bg-white/[0.06] text-muted-foreground")}>
                  {counts[t.id]}
                </span>
              </Link>
            ))}
          </nav>
        </div>

        <div className="mx-3 overflow-hidden rounded-xl bg-panel shadow-[inset_0_0_0_1px_rgb(255_255_255/0.045)]">
          {shown.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              {tab === "open" ? "Nothing needs you. Every flagged anomaly has been triaged." : "Nothing here yet."}
            </p>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {shown.map((q, i) => {
                const Icon = SEVERITY_ICON[q.severity];
                const action = actionById.get(q.actionId);
                const reading = kit.readings.find((r) => r.actionId === q.actionId);
                const site = siteById.get(q.locationId);
                const onAsset = kit.anomalies.filter((x) => x.assetId === q.assetId).length;
                const review = reviews[q.id];
                const why = [
                  `${q.severity[0] + q.severity.slice(1).toLowerCase()} ${human(q.type)} on ${q.assetName}, a ${q.criticality.toLowerCase()} criticality asset.`,
                  q.hidden && "Its mission still reported COMPLETED, so mission status will not show this.",
                  action && !action.ok && `The inspection itself failed (${human(action.failureType)}), so the reading may not be trustworthy.`,
                  q.severity === "CRITICAL" ? "Decide on a work order before the next round." : q.reviewRequired ? "Spot flagged it for operator review." : "Spot did not flag it; acknowledge or dismiss.",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <li key={q.id}>
                    <details name="triage" open={i === 0} className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                        <ChevronRight aria-hidden className="size-4 shrink-0 text-helper transition-transform group-open:rotate-90" />
                        <span className={cn("inline-flex w-24 shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1", SEVERITY_UI[q.severity])}>
                          <Icon aria-hidden className="size-3" />
                          {q.severity}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium first-letter:uppercase">{human(q.type)}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {q.assetName} · {q.criticality.toLowerCase()} criticality · {q.locationName}
                          </span>
                        </span>
                        {q.hidden && <span className="shrink-0 rounded-full bg-hold/10 px-2 py-0.5 text-xs text-hold ring-1 ring-hold/30">Hidden in COMPLETED</span>}
                        {review && <ReviewChip status={review.status} />}
                        <span className="w-32 shrink-0 text-right font-mono text-xs text-helper">
                          {q.missionId} · {kitTime(q.timestamp)}
                        </span>
                      </summary>

                      <div className="space-y-4 px-4 pt-1 pb-4 pl-11">
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <Facts title="What Spot saw">
                            <Fact label="Action" value={action ? human(action.type) : "Unknown"} />
                            <Fact
                              label="Result"
                              value={action?.ok ? "OK" : `Failed${action?.failureType ? `, ${human(action.failureType)}` : ""}`}
                              className={action?.ok ? "text-go" : "text-recall"}
                            />
                            <Fact label="Reading" value={reading ? `${reading.value} ${reading.unit} · ${reading.quality.toLowerCase()} quality` : "None recorded"} mono />
                            <Fact label="Battery" value={action ? `${action.battery}%` : "Unknown"} mono />
                            {action && <InspectionImage type={action.type} assetType={q.assetName} className="mt-2" />}
                          </Facts>
                          <Facts title="Context">
                            <Fact label="Asset criticality" value={q.criticality.toLowerCase()} />
                            <Fact label="Anomalies on this asset" value={`${onAsset} in the kit`} mono />
                            <Fact label="Anomalies at this location" value={`${site?.anomalies ?? 0} in the kit`} mono />
                            <Fact label="Location success rate" value={site ? `${pct(site.ok, site.total)}% (${site.ok}/${site.total})` : "Unknown"} mono />
                          </Facts>
                          <div className="rounded-lg bg-primary/10 p-3 ring-1 ring-primary/30">
                            <h3 className="label-caps mb-1.5 text-link">Why this needs you</h3>
                            <p className="leading-relaxed">{why}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {review && (
                            <p className="mr-2 text-xs text-muted-foreground">
                              {REVIEW_UI[review.status].label} by Operator · {et(pgDate(review.created_at), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET
                            </p>
                          )}
                          <form action={reviewAnomaly} className="flex flex-wrap items-center gap-2">
                            <input type="hidden" name="anomalyId" value={q.id} />
                            {review?.status !== "work_order" && (
                              <Button name="status" value="work_order">
                                <Wrench aria-hidden />
                                Create work order
                              </Button>
                            )}
                            {!review && (
                              <>
                                <Button name="status" value="acknowledged" variant="secondary">
                                  Acknowledge
                                </Button>
                                <Button name="status" value="dismissed" variant="ghost">
                                  Dismiss
                                </Button>
                              </>
                            )}
                            {review && (
                              <Button name="status" value="reopened" variant="outline">
                                <RotateCcw aria-hidden />
                                Reopen
                              </Button>
                            )}
                          </form>
                          <Link
                            href={`/missions/${q.missionId}`}
                            className="ml-auto text-sm text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                          >
                            Open mission {q.missionId}
                          </Link>
                        </div>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {limit && rows.length > limit && (
          <p className="px-4 text-sm text-muted-foreground">
            Showing <span className="tabular-nums">{limit}</span> of <span className="tabular-nums">{rows.length}</span> ·{" "}
            <Link href={tab === "open" ? "/anomalies" : `/anomalies?tab=${tab}`} className="text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
              See all
            </Link>
          </p>
        )}
      </Card>
    </section>
  );
}

export function ReviewChip({ status }: { status: ReviewStatus }) {
  const ui = REVIEW_UI[status];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1", ui.className)}>
      <ui.Icon aria-hidden className="size-3" />
      {ui.label}
    </span>
  );
}

function Facts({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="label-caps mb-1.5 text-helper">{title}</h3>
      <dl className="space-y-1">{children}</dl>
    </div>
  );
}

function Fact({ label, value, mono, className }: { label: string; value: string; mono?: boolean; className?: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-right first-letter:uppercase", mono && "font-mono tabular-nums", className)}>{value}</dd>
    </div>
  );
}
