// Proves drill isolation on the real Neon project: a row written on a drill branch never reaches main.
// Also checks the decision receipt write and a real branch outage (the drill branch deleted under a session).
// Run: npm run db:branch-check
import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import { connectionUri, createBranch, deleteBranch, drillRoute, prune } from "../lib/neon-branch.ts";

if (!process.env.NEON_API_KEY) {
  console.log("skip: NEON_API_KEY is not set");
  process.exit(0);
}

const marker = `branch-check-${Date.now()}`;
const main = neon(process.env.DATABASE_URL);
const b = await createBranch({ name: `drill-check-${Date.now().toString(36)}` });
console.log(`created ${b.name} in ${b.ms} ms`);
try {
  const drill = neon(await connectionUri(b.id));
  // Same statement shape as logDecision's main write: the decision and its durable receipt in one statement.
  await drill`WITH d AS (INSERT INTO decisions (verdict, reasons, source, operator_action) VALUES ('HOLD', ${JSON.stringify([{ text: marker }])}, 'replay', 'confirmed') RETURNING *)
              INSERT INTO receipts (kind, ref, at, body) SELECT 'decision', id::text, created_at, to_jsonb(d) FROM d`;
  const [{ n: receipts }] = await drill`SELECT count(*)::int AS n FROM receipts WHERE body->'reasons'->0->>'text' = ${marker}`;
  assert.equal(receipts, 1);
  assert.equal((await drillRoute(b.id)).write !== null, true, "a live drill branch takes drill writes");
  const [{ n: onDrill }] = await drill`SELECT count(*)::int AS n FROM decisions WHERE reasons->0->>'text' = ${marker}`;
  const [{ n: onMain }] = await main`SELECT count(*)::int AS n FROM decisions WHERE reasons->0->>'text' = ${marker}`;
  console.log(`row on drill branch: ${onDrill}, on main: ${onMain}`);
  assert.equal(onDrill, 1);
  assert.equal(onMain, 0);
} finally {
  await deleteBranch(b.id);
  console.log(`deleted ${b.name}`);
}
// Outage: the session's drill branch is gone. Reads fall back to main, drill writes turn off.
const route = await drillRoute(b.id);
console.log(`after delete: write ${route.write === null ? "off" : "ON"}, reads from ${route.read === process.env.DATABASE_URL ? "main" : "other"}`);
assert.equal(route.write, null);
assert.equal(route.read, process.env.DATABASE_URL);
await assert.rejects(() => prune("", 0), "prune must refuse an empty prefix");
console.log("PASS");
