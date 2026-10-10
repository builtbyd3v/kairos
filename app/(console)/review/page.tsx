import { Suspense } from "react";
import { connection } from "next/server";
import { neon } from "@neondatabase/serverless";
import { connectionUri, createBranch, deleteBranch, prune } from "@/lib/neon-branch";
import type { Decision } from "@/lib/decisions";
import { VerdictChip } from "@/components/status";
import { pgDate } from "@/components/triage-inbox";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const TZ = "America/New_York";
const WINDOW_MS = 6 * 3600000; // Neon project history_retention_seconds = 21600
const SUBTITLE = "Open the decision log exactly as it was at a past minute. Neon branches main at that moment, we read it, then delete the branch.";

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
      <div className="px-8 py-6">
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
          // note: same row layout as the Insights decision log; copied because that file is owned by another agent right now.
          <ul className="divide-y divide-border text-sm">
            {result.rows.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 py-2">
                <span className="font-mono text-xs text-helper">{hhmm(pgDate(d.created_at))} ET</span>
                <VerdictChip verdict={d.verdict} />
                <span className="capitalize">{d.operator_action}</span>
                <span className="rounded bg-secondary px-1.5 text-xs text-muted-foreground">{d.source}</span>
                <span className="text-muted-foreground">{d.reasons[0]?.text ?? "No limits close"}</span>
                {d.orbit_call && <span className="font-mono text-xs text-helper">→ {d.orbit_call}</span>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

async function decisionsAt(t: Date) {
  // note: keeps 2 leftover as-of branches in case two reviews run at once; older stragglers from crashed requests are cleared here.
  await prune("asof-", 2);
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

// note: receipts never see deletes (a replay reset), so a row deleted before that minute can still show. Live decisions are never deleted.
async function receiptsAt(t: Date) {
  const sql = neon(process.env.DATABASE_URL!);
  const [rows, [{ n }]] = await Promise.all([
    sql`SELECT body FROM receipts WHERE kind = 'decision' AND at <= ${t.toISOString()} ORDER BY at DESC LIMIT 20`,
    sql`SELECT count(*)::int AS n FROM receipts WHERE kind = 'decision' AND at <= ${t.toISOString()}`,
  ]);
  return { branch: null, rows: rows.map((r) => r.body as Decision), total: n as number };
}
