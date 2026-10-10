import { Suspense } from "react";
import { connection } from "next/server";
import { analyze, loadKit } from "@/lib/kit";
import { currentReviews } from "@/lib/reviews";
import { PageHeader } from "@/components/page-header";
import { et, planNextRound } from "@/components/next-round";
import { briefOf } from "@/components/shift-brief";
import { workOrders } from "@/components/work-order-list";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function BriefPage() {
  return (
    <Suspense fallback={<PageHeader title="Shift handoff" subtitle="Building the brief…" />}>
      <Brief />
    </Suspense>
  );
}

const human = (s: string) => s.replaceAll("_", " ").toLowerCase();

async function Brief() {
  await connection();
  const now = new Date();
  const kit = await loadKit();
  const [reviews, plan] = await Promise.all([currentReviews(), planNextRound(kit, now)]);
  const open = analyze(kit).queue.filter((q) => q.reviewRequired && !reviews[q.id]);
  const wos = workOrders(kit, reviews);

  return (
    // Prints black on white: every descendant drops the dark-theme colors.
    <div className="print:bg-white print:**:text-black">
      <PageHeader
        title="Shift handoff"
        subtitle={`${et(now, { dateStyle: "full" })}, ${et(now, { hour: "numeric", minute: "2-digit" })} ET`}
        actions={<p className="text-xs text-helper print:hidden">Press ⌘P or Ctrl+P to print</p>}
      />
      <main className="mx-auto max-w-3xl space-y-8 px-8 py-6 print:max-w-none print:px-0">
        <section aria-labelledby="summary">
          <h2 id="summary" className="mb-2 text-[11px] font-medium tracking-wider text-helper uppercase">
            Summary
          </h2>
          <ul className="list-disc space-y-1.5 pl-5 leading-relaxed">
            {briefOf({ kit, reviews, plan }).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>

        <ItemTable
          title={`Open anomalies (${open.length})`}
          empty="None. Every flagged anomaly has been triaged."
          rows={open.map((q) => [q.id, q.severity, human(q.type), `${q.assetName} (${q.criticality.toLowerCase()})`, q.locationName, q.missionId])}
          head={["ID", "Severity", "Type", "Asset", "Location", "Mission"]}
        />
        <ItemTable
          title={`Work orders (${wos.length})`}
          empty="None."
          rows={wos.map((w) => [w.wo, w.priority, human(w.type), `${w.assetName} (${w.criticality.toLowerCase()})`, w.locationName, w.missionId])}
          head={["WO", "Priority", "Type", "Asset", "Location", "Mission"]}
        />

        <p className="pt-6 text-sm break-inside-avoid">
          Handed over by <span className="inline-block w-48 border-b border-current align-bottom" /> to{" "}
          <span className="inline-block w-48 border-b border-current align-bottom" /> at{" "}
          <span className="inline-block w-20 border-b border-current align-bottom" />
        </p>
      </main>
    </div>
  );
}

function ItemTable({ title, empty, head, rows }: { title: string; empty: string; head: string[]; rows: string[][] }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-2 text-[11px] font-medium tracking-wider text-helper uppercase">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {head.map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r[0]}>
                {r.map((c, i) => (
                  <TableCell key={i} className={i === 0 || i === 5 ? "font-mono tabular-nums" : "first-letter:uppercase"}>
                    {c}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
