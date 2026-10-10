// Run: npm test. Simulates a drill branch outage with a stubbed Neon API: reads fall back to main, writes turn off.
import { test } from "node:test";
import assert from "node:assert/strict";
import { drillRoute } from "./neon-branch.ts";

process.env.DATABASE_URL = "postgres://main.example/neondb";
process.env.NEON_API_KEY = "test-key";
process.env.NEON_PROJECT_ID = "test-project";
const ID = "br-drill-123";
const DRILL_URI = "postgres://drill.example/neondb";
const OFF = { read: process.env.DATABASE_URL, write: null, branch: null };

function stub(handler: (url: string) => Response | Promise<Response>) {
  globalThis.fetch = (async (input: string | URL | Request) => handler(String(input))) as typeof fetch;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const healthy = (url: string) =>
  url.includes("/connection_uri") ? json({ uri: DRILL_URI }) : json({ branch: { id: ID, name: "drill-abc123", default: false, created_at: "" } });

test("healthy drill branch: reads and writes go to the branch", async () => {
  stub(healthy);
  assert.deepEqual(await drillRoute(ID), { read: DRILL_URI, write: DRILL_URI, branch: "drill-abc123" });
});

test("Neon API unreachable: main for reads, drill writes off", async () => {
  stub(() => Promise.reject(new TypeError("fetch failed")));
  assert.deepEqual(await drillRoute(ID), OFF);
});

test("drill branch deleted or pruned (404): main for reads, drill writes off", async () => {
  stub(() => json({ message: "not found" }, 404));
  assert.deepEqual(await drillRoute(ID), OFF);
});

test("connection URI fails after the branch check: drill writes off", async () => {
  stub((url) => (url.includes("/connection_uri") ? json({}, 503) : healthy(url)));
  assert.deepEqual(await drillRoute(ID), OFF);
});

test("main or a non-drill branch is never a drill write target", async () => {
  stub((url) => (url.includes("/connection_uri") ? json({ uri: "postgres://main.example/neondb" }) : json({ branch: { id: ID, name: "main", default: true, created_at: "" } })));
  assert.deepEqual(await drillRoute(ID), OFF);
  stub((url) => (url.includes("/connection_uri") ? json({ uri: DRILL_URI }) : json({ branch: { id: ID, name: "eval-frozen-2026-10-10", default: false, created_at: "" } })));
  assert.deepEqual(await drillRoute(ID), OFF);
});

test("no cookie, a malformed id, or no API key: drill writes off", async () => {
  stub(healthy);
  assert.deepEqual(await drillRoute(undefined), OFF);
  assert.deepEqual(await drillRoute("br-; DROP TABLE"), OFF);
  delete process.env.NEON_API_KEY;
  assert.deepEqual(await drillRoute(ID), OFF);
  process.env.NEON_API_KEY = "test-key";
});
