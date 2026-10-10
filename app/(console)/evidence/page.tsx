import { Suspense } from "react";
import { connection } from "next/server";
import { Check, CircleDashed, GitBranch, X } from "lucide-react";
import { latestEval, listDetections, type EvidenceRow, type Label } from "@/lib/evidence";
import { pgDate } from "@/components/triage-inbox";
import { et } from "@/components/next-round";
import { EvidenceLabelButtons } from "@/components/evidence-label-buttons";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const SUBTITLE = "Every water detection is a row in Neon. Confirm or reject it. Your labels score each model version on a frozen Neon branch.";
const when = (pg: string) => et(pgDate(pg), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const pct = (x: number) => `${(x * 100).toFixed(x < 0.01 ? 2 : 1)}%`;

// Status is color + icon + word. An unlabeled detection is never green.
const LABEL_UI: Record<Label | "none", { Icon: typeof Check; text: string; className: string }> = {
  confirm: { Icon: Check, text: "Confirmed water", className: "bg-go/10 text-go ring-go/40" },
  reject: { Icon: X, text: "Rejected", className: "bg-recall/10 text-recall ring-recall/40" },
  none: { Icon: CircleDashed, text: "Needs label", className: "bg-secondary text-muted-foreground ring-border" },
};

export default function EvidencePage() {
  return (
    <main>
      <PageHeader title="Water evidence" subtitle={SUBTITLE} />
      <div className="space-y-5 px-8 py-6">
        <Suspense fallback={<Card className="px-5 text-sm text-muted-foreground">Loading evidence from Neon…</Card>}>
          <Evidence />
        </Suspense>
      </div>
    </main>
  );
}

async function Evidence() {
  await connection();
  const [rows, scores] = await Promise.all([listDetections(), latestEval()]);
  return (
    <>
      <Card className="animate-rise">
        <CardHeader>
          <CardTitle>Model scores</CardTitle>
          <CardDescription>
            {scores.length ? (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <GitBranch aria-hidden className="size-3.5" />
                Scored on Neon branch <span className="font-mono">{scores[0].branch_name}</span>, a frozen copy of main as of{" "}
                <span className="font-mono">{when(scores[0].branch_as_of)} ET</span>. Run {when(scores[0].run_at)} ET.
              </span>
            ) : (
              "No eval run yet. Run npm run db:score to freeze a branch and score every model version."
            )}
          </CardDescription>
        </CardHeader>
        {scores.length > 0 && (
          <CardContent>
            <div className="overflow-x-auto rounded-xl bg-panel shadow-[inset_0_0_0_1px_rgb(255_255_255/0.045)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="label-caps text-left">
                    {["Model", "Revision", "Detections", "Confirmed", "Rejected", "Precision", "n labeled"].map((h) => (
                      <th key={h} className="px-4 py-2 font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05] font-mono tabular-nums">
                  {scores.map((s) => (
                    <tr key={s.model_id + s.model_revision}>
                      <td className="px-4 py-2 font-sans">{s.model_id}</td>
                      <td className="px-4 py-2">{s.model_revision.slice(0, 7)}</td>
                      <td className="px-4 py-2">{s.detections}</td>
                      <td className="px-4 py-2">{s.confirmed}</td>
                      <td className="px-4 py-2">{s.rejected}</td>
                      <td className="px-4 py-2 text-foreground">{s.precision === null ? "No labels" : pct(s.precision)}</td>
                      <td className="px-4 py-2">{s.confirmed + s.rejected}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-helper">
              Precision = confirmed / (confirmed + rejected), from the latest label per detection. Small n: read it as a direction, not a benchmark. Seeded
              rows carry dataset ground-truth labels.
            </p>
          </CardContent>
        )}
      </Card>

      <Card className="animate-rise [--rise-delay:60ms]">
        <CardHeader>
          <CardTitle>Detections</CardTitle>
          <CardDescription>Newest first. Labels are append-only in Neon; the latest one counts.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No detections yet. They appear here when the water model flags a frame.</p>
          ) : (
            <ul className="divide-y divide-white/[0.05] rounded-xl bg-panel shadow-[inset_0_0_0_1px_rgb(255_255_255/0.045)]">
              {rows.map((d) => (
                <Row key={d.id} d={d} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Row({ d }: { d: EvidenceRow }) {
  const ui = LABEL_UI[d.label ?? "none"];
  const fullFrame = d.box_w >= 0.999 && d.box_h >= 0.999;
  return (
    <li className="flex flex-wrap items-center gap-4 px-4 py-3">
      <figure className="relative w-24 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/[0.06]">
        {/* Plain img: frames are small public files or remote captures; the optimizer adds nothing here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={d.frame_uri} alt={`Frame for detection ${d.id}`} loading="lazy" className="block aspect-[4/3] w-full object-cover" />
        {!fullFrame && (
          // SVG attributes, not inline style: the box is normalized, so a 0..1 viewBox draws it at any size.
          <svg aria-hidden viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 size-full">
            <rect x={d.box_x} y={d.box_y} width={d.box_w} height={d.box_h} fill="none" vectorEffect="non-scaling-stroke" className="stroke-hold stroke-2" />
          </svg>
        )}
      </figure>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-mono tabular-nums">p(water) {pct(d.score)}</span>
          <span className="text-muted-foreground">{fullFrame ? "whole frame" : `${pct(d.area_frac)} of frame`}</span>
          <span className="text-muted-foreground">· {d.waypoint ?? "no waypoint"}</span>
          {d.seeded && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-link ring-1 ring-primary/40">Seeded demo data</span>}
        </p>
        <p className="truncate text-xs text-helper">
          <span className="font-mono">#{d.id}</span> · {when(d.created_at)} ET · {d.model_id} @ <span className="font-mono">{d.model_revision.slice(0, 7)}</span> · {d.source} ·{" "}
          {d.license}
        </p>
      </div>
      <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1", ui.className)}>
        <ui.Icon aria-hidden className="size-3" />
        {ui.text}
        {d.operator && <span className="font-normal opacity-80">· {d.operator}</span>}
      </span>
      <EvidenceLabelButtons id={d.id} current={d.label} />
    </li>
  );
}
