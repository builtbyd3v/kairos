import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { GitBranch } from "lucide-react";
import { neon } from "@neondatabase/serverless";
import { connectionUri, createBranch, deleteBranch, listBranches, prune } from "@/lib/neon-branch";
import type { Decision } from "@/lib/decisions";
import type { Verdict } from "@/lib/verdict";
import { cn } from "@/lib/utils";
import { VerdictChip } from "@/components/status";
import { pgDate } from "@/components/triage-inbox";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const TZ = "America/New_York";
const WINDOW_MS = 6 * 3600000; // Neon project history_retention_seconds = 21600
const SUBTITLE = "Open a saved moment, or the decision log at any past minute. Each moment is a Neon branch of main, frozen when it happened.";

const hhmm = (d: Date) => d.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

/** "HH:MM" in plant time to the latest such minute at or before now (so 23:50 just after midnight means yesterday). "YYYY-MM-DDTHH:MM" picks the day. */
function plantMinute(at: string, now: Date): Date | null {
  const m = /^(?:(\d{4}-\d\d-\d\d)T)?(([01]\d|2[0-3]):[0-5]\d)$/.exec(at);
  if (!m) return null;
  if (m[1]) at = m[2];
  const day = m[1] ?? now.toLocaleDateString("en-CA", { timeZone: TZ });
  // note: uses today's UTC offset; a minute across a DST switch lands one hour off, twice a year.
  const off = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" }).formatToParts(now).find((p) => p.type === "timeZoneName")!.value.slice(3);
  const t = new Date(`${day}T${at}:00${off}`);
  if (Number.isNaN(t.getTime())) return null;
  return t > now && !m[1] ? new Date(t.getTime() - 86400000) : t;
}

export default function ReviewPage({ searchParams }: PageProps<"/review">) {
  return (
    <main>
      <PageHeader title="Incident review" subtitle={SUBTITLE} />
      <div className="space-y-5 px-8 py-6">
        <Suspense fallback={<Card className="px-5 text-sm text-muted-foreground">Loading saved moments…</Card>}>
          <Snapshots searchParams={searchParams} />
        </Suspense>
        <Suspense fallback={<Card className="px-5 text-sm text-muted-foreground">Branching main at that minute…</Card>}>
          <AsOf searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function AsOf({ searchParams }: Pick<PageProps<"/review">, "searchParams">) {
  await connection();
  const now = new Date();
  const raw = (await searchParams).at;
  const at = typeof raw === "string" ? raw : hhmm(new Date(now.getTime() - 30 * 60000));
  const t = plantMinute(at, now);
  const invalid = !t ? "Enter a date and time." : t > now ? "Pick a minute in the past." : null;

  // Inside Neon's 6 h history window: branch main at that minute. Older, or if branching fails: the durable receipts on main.
  let result: Awaited<ReturnType<typeof decisionsAt>> | Awaited<ReturnType<typeof receiptsAt>> | string;
  if (invalid) result = invalid;
  else
    try {
      result = now.getTime() - t!.getTime() > WINDOW_MS ? await receiptsAt(t!) : await decisionsAt(t!);
    } catch {
      try {
        result = await receiptsAt(t!);
      } catch (e) {
        result = `That minute is not available right now (${e instanceof Error ? e.message : "Neon error"}). Try again in a moment.`;
      }
    }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Decision log as of {at.replace("T", " ")} ET</CardTitle>
        <CardDescription>
          {typeof result === "string" ? "No branch created." : !result.branch ? (
            <>
              Read from durable receipts on main, a copy of each decision saved when it was logged. Neon keeps 6 hours of history; receipts keep the rest.{" "}
              {result.total} decisions existed at that minute.
            </>
          ) : (
            <>
              Read from Neon branch <span className="font-mono">{result.branch.name}</span>, created in <span className="font-mono">{result.branch.ms} ms</span> and deleted after this page loaded.{" "}
              {result.total} decisions existed at that minute.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="flex flex-wrap items-center gap-2">
          <label htmlFor="at" className="text-sm text-muted-foreground">
            Plant time (ET)
          </label>
          <input id="at" name="at" type="datetime-local" required defaultValue={t ? t.toLocaleString("sv-SE", { timeZone: TZ }).slice(0, 16).replace(" ", "T") : at} className="h-8 rounded-lg bg-secondary px-2 font-mono text-sm ring-1 ring-border" />
          <Button size="sm" type="submit">
            Open log
          </Button>
        </form>
        {typeof result === "string" ? (
          <p className="text-sm text-muted-foreground">{result}</p>
        ) : result.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No decisions had been logged yet at that minute.</p>
        ) : (
          <DecisionRows rows={result.rows} />
        )}
      </CardContent>
    </Card>
  );
}

async function decisionsAt(t: Date) {
  // note: keeps 1 leftover as-of branch in case two reviews run at once; older stragglers from crashed requests are cleared here.
  // Neon Free has 10 branches per project; the budget is in lib/operator.ts (KEEP_SESSION_BRANCHES).
  await prune("asof-", 1);
  const branch = await createBranch({ name: `asof-${Date.now().toString(36).slice(-6)}`, parentTimestamp: t.toISOString() });
  try {
    const sql = neon(await connectionUri(branch.id));
    const [rows, [{ n }]] = await Promise.all([
      sql`SELECT id, created_at::text AS created_at, mission_id, verdict, reasons, source, operator_action, orbit_call FROM decisions ORDER BY id DESC LIMIT 20`,
      sql`SELECT count(*)::int AS n FROM decisions`,
    ]);
    return { branch, rows: rows as Decision[], total: n as number };
  } finally {
    await deleteBranch(branch.id).catch(() => {});
  }
}

// note: same row layout as the Insights decision log; copied because that file is owned by another agent right now.
function DecisionRows({ rows }: { rows: (Decision & { seeded?: boolean })[] }) {
  return (
    <ul className="divide-y divide-border text-sm">
      {rows.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center gap-x-3 py-2">
          <span className="font-mono text-xs text-helper">{hhmm(pgDate(d.created_at))} ET</span>
          <VerdictChip verdict={d.verdict} />
          <span className="capitalize">{d.operator_action}</span>
          <span className="rounded bg-secondary px-1.5 text-xs text-muted-foreground">{d.source}</span>
          {d.seeded && <span className="rounded bg-primary/10 px-1.5 text-xs text-link">seeded</span>}
          <span className="text-muted-foreground">{d.reasons[0]?.text ?? "No limits close"}</span>
          {d.orbit_call && <span className="font-mono text-xs text-helper">→ {d.orbit_call}</span>}
        </li>
      ))}
    </ul>
  );
}

// ---- Saved moments: snap-<name> branches cut by scripts/snapshots.mts, listed from the snapshots table on main.

type Snap = {
  name: string;
  label: string;
  at: string;
  verdict: Verdict | null;
  decided: string;
  why: string;
  branch_as_of: string | null;
  weather: { source: string; at: string; alerts: string[]; precipMmPerHour: number; thunderPct: number; gustKmh: number };
};
type Row = Decision & { seeded: boolean };
type Det = { id: number; waypoint: string | null; score: number; source: string; seeded: boolean; label: string | null };
const TABLES = ["decisions", "detections", "detection_labels", "anomaly_reviews"] as const;
type Counts = Record<(typeof TABLES)[number], number>;
const when = (pg: string) => pgDate(pg).toLocaleString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

async function Snapshots({ searchParams }: Pick<PageProps<"/review">, "searchParams">) {
  await connection();
  const raw = (await searchParams).snap;
  // note: a missing table (main not migrated yet) shows the empty state instead of failing the page.
  const snaps = (await neon(process.env.DATABASE_URL!)`SELECT name, label, at::text AS at, verdict, decided, why, weather, branch_as_of::text AS branch_as_of
                                                       FROM snapshots ORDER BY at`.catch(() => [])) as Snap[];
  const open = snaps.find((s) => s.name === raw); // only names from the table, so a URL cannot pick an arbitrary branch
  return (
    <Card>
      <CardHeader>
        <CardTitle>Saved moments</CardTitle>
        <CardDescription>Each card is a Neon branch of main, frozen at that moment. Open one to read it (read-only) and see what changed since.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {snaps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No saved moments yet. Run npm run db:snapshots.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-3">
            {snaps.map((s) => (
              <li key={s.name}>
                <Link
                  href={`/review?snap=${s.name}`}
                  scroll={false}
                  aria-current={s === open ? "true" : undefined}
                  className={cn("block h-full space-y-2 rounded-xl bg-panel p-4 ring-1 ring-border transition-colors hover:ring-primary/60", s === open && "ring-2 ring-primary")}
                >
                  <span className="flex items-center gap-2">
                    {s.verdict && <VerdictChip verdict={s.verdict} />}
                    <span className="font-mono text-xs text-helper">{when(s.at)} ET</span>
                  </span>
                  <span className="block font-medium">{s.label}</span>
                  <span className="block text-sm">{s.decided}</span>
                  <span className="block text-xs text-muted-foreground">{s.why}</span>
                  <span className="flex items-center gap-1 font-mono text-xs text-helper">
                    <GitBranch aria-hidden className="size-3" /> snap-{s.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {open && (
          <Suspense key={open.name} fallback={<p className="text-sm text-muted-foreground">Opening branch snap-{open.name}…</p>}>
            <SnapshotView s={open} />
          </Suspense>
        )}
      </CardContent>
    </Card>
  );
}

async function SnapshotView({ s }: { s: Snap }) {
  let data: Awaited<ReturnType<typeof readSnapshot>>;
  try {
    data = await readSnapshot(s.name);
  } catch (e) {
    return (
      <p className="text-sm text-muted-foreground">
        Branch snap-{s.name} is not readable right now ({e instanceof Error ? e.message : "Neon error"}). Run npm run db:snapshots to recreate it.
      </p>
    );
  }
  const { decisions, detections, added, newest } = data;
  const w = s.weather;
  return (
    <div className="space-y-4 rounded-xl bg-panel p-4 ring-1 ring-border">
      <p className="text-sm">
        Read from Neon branch <span className="font-mono">snap-{s.name}</span>
        {s.branch_as_of && (
          <>
            , a copy of main as of <span className="font-mono">{when(s.branch_as_of)} ET</span>
          </>
        )}
        , in a read-only transaction.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        <section className="space-y-1 text-sm">
          <h3 className="label-caps">Weather then</h3>
          <p>
            Rain up to <span className="font-mono">{w.precipMmPerHour.toFixed(1)} mm/h</span> · thunder <span className="font-mono">{w.thunderPct}%</span> · gusts{" "}
            <span className="font-mono">{Math.round(w.gustKmh)} km/h</span>
          </p>
          <p className="text-muted-foreground">{w.alerts.length ? `Alerts: ${w.alerts.join(", ")}` : "No NWS alerts for the site"}</p>
          <p className="text-xs text-helper">
            Worst within an hour of {when(w.at)} ET. {w.source}.
          </p>
        </section>
        <section className="space-y-1 text-sm md:col-span-2">
          <h3 className="label-caps">Added on main since</h3>
          <p>
            {TABLES.map((t, i) => (
              <span key={t}>
                {i > 0 && " · "}
                <span className="font-mono tabular-nums">+{added[t]}</span> {t.replace("_", " ")}
              </span>
            ))}
          </p>
          {newest.length > 0 && <DecisionRows rows={newest} />}
        </section>
      </div>
      <section className="space-y-1">
        <h3 className="label-caps">Decisions as of then</h3>
        {decisions.length ? <DecisionRows rows={decisions} /> : <p className="text-sm text-muted-foreground">No decisions yet at that moment.</p>}
      </section>
      <section className="space-y-1">
        <h3 className="label-caps">Water evidence as of then</h3>
        <ul className="divide-y divide-border text-sm">
          {detections.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-3 py-2">
              <span className="font-mono text-xs text-helper">#{d.id}</span>
              <span className="font-mono tabular-nums">p(water) {Math.round(d.score * 100)}%</span>
              <span className="text-muted-foreground">
                {d.source} · {d.waypoint ?? "no waypoint"}
              </span>
              <span className={d.label === "confirm" ? "text-go" : d.label === "reject" ? "text-recall" : "text-muted-foreground"}>
                {d.label === "confirm" ? "Confirmed water" : d.label === "reject" ? "Rejected" : "Needs label"}
              </span>
              {d.seeded && <span className="rounded bg-primary/10 px-1.5 text-xs text-link">seeded</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

async function readSnapshot(name: string) {
  const b = (await listBranches()).find((x) => x.name === `snap-${name}`);
  if (!b) throw new Error("branch missing");
  const snap = neon(await connectionUri(b.id));
  // to_jsonb(d)->>'seeded': decisions.seeded may not exist on a branch cut before the column was added.
  const [decisions, detections, maxes] = await snap.transaction(
    (tx) => [
      tx`SELECT id::int AS id, created_at::text AS created_at, mission_id, verdict, reasons, source, operator_action, orbit_call,
                coalesce((to_jsonb(d)->>'seeded')::boolean, false) AS seeded FROM decisions d ORDER BY id DESC LIMIT 12`,
      tx`SELECT d.id::int AS id, d.waypoint, d.score, d.source, d.seeded, l.label
         FROM detections d LEFT JOIN LATERAL (SELECT label FROM detection_labels WHERE detection_id = d.id ORDER BY id DESC LIMIT 1) l ON true
         ORDER BY d.id DESC LIMIT 12`,
      tx`SELECT (SELECT coalesce(max(id), 0)::int FROM decisions) AS decisions, (SELECT coalesce(max(id), 0)::int FROM detections) AS detections,
                (SELECT coalesce(max(id), 0)::int FROM detection_labels) AS detection_labels, (SELECT coalesce(max(id), 0)::int FROM anomaly_reviews) AS anomaly_reviews`,
    ],
    { readOnly: true },
  );
  const m = maxes[0] as Counts;
  // Rows on main with a higher id than the branch's newest = added since. These tables are append-only, so that is the whole diff.
  const [counts, newest] = await neon(process.env.DATABASE_URL!).transaction(
    (tx) => [
      tx`SELECT (SELECT count(*)::int FROM decisions WHERE id > ${m.decisions}) AS decisions, (SELECT count(*)::int FROM detections WHERE id > ${m.detections}) AS detections,
                (SELECT count(*)::int FROM detection_labels WHERE id > ${m.detection_labels}) AS detection_labels,
                (SELECT count(*)::int FROM anomaly_reviews WHERE id > ${m.anomaly_reviews}) AS anomaly_reviews`,
      tx`SELECT id::int AS id, created_at::text AS created_at, mission_id, verdict, reasons, source, operator_action, orbit_call, seeded
         FROM decisions WHERE id > ${m.decisions} ORDER BY id DESC LIMIT 5`,
    ],
    { readOnly: true },
  );
  return { decisions: decisions as Row[], detections: detections as Det[], added: counts[0] as Counts, newest: newest as Row[] };
}

// note: receipts never see deletes (a replay reset), so a row deleted before that minute can still show. Live decisions are never deleted.
async function receiptsAt(t: Date) {
  const sql = neon(process.env.DATABASE_URL!);
  const [rows, [{ n }]] = await Promise.all([
    sql`SELECT body FROM receipts WHERE kind = 'decision' AND at <= ${t.toISOString()} ORDER BY at DESC LIMIT 20`,
    sql`SELECT count(*)::int AS n FROM receipts WHERE kind = 'decision' AND at <= ${t.toISOString()}`,
  ]);
  return { branch: null, rows: rows.map((r) => r.body as Decision), total: n as number };
}
