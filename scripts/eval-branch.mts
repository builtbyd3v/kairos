// Scores every model revision's water detections against operator labels on a frozen Neon branch, then saves the scores to main.
// The branch is a copy-on-write snapshot of main: every revision is scored on the same labels, even while operators keep labeling.
// Run: npm run db:score (reuses today's eval-frozen-<date> branch). npm run db:score -- --refreeze replaces it with a fresh copy of main.
import { neon } from "@neondatabase/serverless";
import { connectionUri, createBranch, deleteBranch, getBranch, listBranches } from "../lib/neon-branch.ts";

const url = process.env.DATABASE_URL;
if (!url || !process.env.NEON_API_KEY) throw new Error("DATABASE_URL and NEON_API_KEY must be set. Run with --env-file=.env.local.");
const main = neon(url);

const name = `eval-frozen-${new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })}`;
let existing = (await listBranches()).find((b) => b.name === name);
if (existing && process.argv.includes("--refreeze")) {
  await deleteBranch(existing.id); // only ever an eval-frozen-* branch this script made
  console.log(`deleted ${name} to refreeze`);
  existing = undefined;
}
const branch = existing ?? (await getBranch((await createBranch({ name })).id));
console.log(`${existing ? "reusing" : "created"} ${branch.name}, frozen copy of main as of ${branch.created_at}`);

// Read-only transaction: the frozen branch is never written to.
const frozen = neon(await connectionUri(branch.id));
const [scores] = await frozen.transaction(
  (sql) => [
    sql`SELECT d.model_id, d.model_revision, count(*)::int AS detections,
               count(*) FILTER (WHERE l.label = 'confirm')::int AS confirmed,
               count(*) FILTER (WHERE l.label = 'reject')::int AS rejected
        FROM detections d
        LEFT JOIN LATERAL (SELECT label FROM detection_labels WHERE detection_id = d.id ORDER BY id DESC LIMIT 1) l ON true
        GROUP BY d.model_id, d.model_revision ORDER BY d.model_id, d.model_revision`,
  ],
  { readOnly: true },
);
const rows = (scores as { model_id: string; model_revision: string; detections: number; confirmed: number; rejected: number }[]).map((r) => ({
  ...r,
  precision: r.confirmed + r.rejected ? r.confirmed / (r.confirmed + r.rejected) : null,
}));

const runAt = new Date().toISOString();
await main.query(
  `INSERT INTO eval_runs (run_at, branch_name, branch_as_of, model_id, model_revision, detections, confirmed, rejected, precision)
   SELECT $1, $2, $3, model_id, model_revision, detections, confirmed, rejected, precision
   FROM json_to_recordset($4) AS r(model_id text, model_revision text, detections int, confirmed int, rejected int, precision real)`,
  [runAt, branch.name, branch.created_at, JSON.stringify(rows)],
);
console.table(rows.map((r) => ({ ...r, model_revision: r.model_revision.slice(0, 7), precision: r.precision === null ? "n/a" : r.precision.toFixed(3), n: r.confirmed + r.rejected })));
console.log(`saved ${rows.length} rows to eval_runs on main (run_at ${runAt})`);
