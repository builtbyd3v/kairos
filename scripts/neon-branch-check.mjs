// Proves drill isolation on the real Neon project: a row written on a drill branch never reaches main.
// Run: node --env-file=.env.local scripts/neon-branch-check.mjs
import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import { connectionUri, createBranch, deleteBranch, prune } from "../lib/neon-branch.ts";

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
  await drill`INSERT INTO decisions (verdict, reasons, source, operator_action) VALUES ('HOLD', ${JSON.stringify([{ text: marker }])}, 'replay', 'confirmed')`;
  const [{ n: onDrill }] = await drill`SELECT count(*)::int AS n FROM decisions WHERE reasons->0->>'text' = ${marker}`;
  const [{ n: onMain }] = await main`SELECT count(*)::int AS n FROM decisions WHERE reasons->0->>'text' = ${marker}`;
  console.log(`row on drill branch: ${onDrill}, on main: ${onMain}`);
  assert.equal(onDrill, 1);
  assert.equal(onMain, 0);
} finally {
  await deleteBranch(b.id);
  console.log(`deleted ${b.name}`);
}
await assert.rejects(() => prune("", 0), "prune must refuse an empty prefix");
console.log("PASS");
