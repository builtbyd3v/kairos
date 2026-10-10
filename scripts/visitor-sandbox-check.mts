// Proves the visitor sandbox on the real Neon project: a visitor write is routed to its own branch, main's row counts stay
// unchanged, and with no branch the write is refused instead of going to main. Cleans up the branch it creates.
// Run: npm run db:sandbox-check
import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import { connectionUri, createBranch, deleteBranch, drillRoute } from "../lib/neon-branch.ts";
import { routeWrite } from "../lib/operator.ts";

if (!process.env.NEON_API_KEY) {
  console.log("skip: NEON_API_KEY is not set");
  process.exit(0);
}

const main = neon(process.env.DATABASE_URL!);
const count = async () =>
  (await main`SELECT (SELECT count(*)::int FROM decisions) AS decisions, (SELECT count(*)::int FROM detection_labels) AS labels`)[0] as { decisions: number; labels: number };
const before = await count();
console.log("main before:", before);

const marker = `sandbox-check-${Date.now()}`;
// Same shape as newSessionBranch in lib/operator.ts (that one also sets the visitor cookie, which needs a request).
const b = await createBranch({ name: `drill-${Date.now().toString(36).slice(-6)}` });
console.log(`visitor branch ${b.name} created in ${b.ms} ms`);
try {
  // The visitor's write path: routeWrite(toMain = false) with the session branch resolved the way sessionBranch() does (drillRoute).
  const target = await routeWrite(false, async () => {
    const r = await drillRoute(b.id);
    return r.write && r.branch ? { uri: r.write, name: r.branch } : null;
  });
  assert.ok(!("refused" in target), "a visitor with a live branch is not refused");
  assert.equal(target.branch, b.name);
  assert.notEqual(target.url, process.env.DATABASE_URL, "visitor write never targets main");
  const sql = neon(target.url);
  await sql`WITH d AS (INSERT INTO decisions (verdict, reasons, source, operator_action) VALUES ('HOLD', ${JSON.stringify([{ text: marker }])}, 'live', 'confirmed') RETURNING *)
            INSERT INTO receipts (kind, ref, at, body) SELECT 'decision', id::text, created_at, to_jsonb(d) FROM d`;
  const [{ id: det }] = await sql`SELECT id FROM detections ORDER BY id LIMIT 1`;
  await sql`INSERT INTO detection_labels (detection_id, label, operator, note) VALUES (${det}, 'reject', 'sandbox check', ${marker})`;

  const [{ n: onBranch }] = await neon(await connectionUri(b.id))`SELECT count(*)::int AS n FROM decisions WHERE reasons->0->>'text' = ${marker}`;
  const [{ n: onMain }] = await main`SELECT count(*)::int AS n FROM decisions WHERE reasons->0->>'text' = ${marker}`;
  const after = await count();
  console.log(`visitor decision on branch: ${onBranch}, on main: ${onMain}`);
  console.log("main after:", after);
  assert.equal(onBranch, 1);
  assert.equal(onMain, 0);
  assert.deepEqual(after, before, "main row counts unchanged");
} finally {
  await deleteBranch(b.id);
  console.log(`deleted ${b.name}`);
}

// Branch gone (pruned, API down): the visitor's next write is refused, never sent to main.
const refused = await routeWrite(false, async () => {
  const r = await drillRoute(b.id);
  return r.write && r.branch ? { uri: r.write, name: r.branch } : null;
});
assert.ok("refused" in refused);
console.log(`after delete: ${refused.refused}`);
assert.deepEqual(await count(), before, "main row counts unchanged");
console.log("PASS");
