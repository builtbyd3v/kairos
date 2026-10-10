// Run: npm test. Operator key check and write routing: operator -> main, visitor -> own branch, no branch -> refused, never main.
import { test } from "node:test";
import assert from "node:assert/strict";
import { allow, keyMatches, operatorToken, routeWrite, tokenValid } from "./operator.ts";

const MAIN = "postgres://main.example/neondb";
const BRANCH = { uri: "postgres://drill.example/neondb", name: "drill-abc123" };
process.env.DATABASE_URL = MAIN;

test("operator key: only the exact key matches; no OPERATOR_KEY means nobody is operator", () => {
  assert.equal(keyMatches("s3cret-key", "s3cret-key"), true);
  for (const bad of ["s3cret-ke", "s3cret-key ", "", null, undefined, 42, "x".repeat(500)]) assert.equal(keyMatches(bad, "s3cret-key"), false, String(bad));
  assert.equal(keyMatches("anything", undefined), false);
  assert.equal(keyMatches("", ""), false);
});

test("operator cookie: valid only for the current key; rotating the key signs everyone out", () => {
  const t = operatorToken("k1")!;
  assert.equal(tokenValid(t, "k1"), true);
  assert.equal(tokenValid(t, "k2"), false);
  assert.equal(tokenValid(t.slice(1), "k1"), false);
  assert.equal(tokenValid(undefined, "k1"), false);
  assert.equal(operatorToken(""), null);
  assert.equal(tokenValid(t, undefined), false);
});

test("operator live write goes to main", async () => {
  let asked = false;
  const t = await routeWrite(true, async () => ((asked = true), BRANCH));
  assert.deepEqual(t, { url: MAIN, branch: null });
  assert.equal(asked, false, "an operator write never creates a branch");
});

test("visitor write goes to the visitor's own branch", async () => {
  assert.deepEqual(await routeWrite(false, async () => BRANCH), { url: BRANCH.uri, branch: BRANCH.name });
});

test("no branch (none, API down, branch limit): refused, never main", async () => {
  for (const branch of [async () => null, async () => Promise.reject(new Error("Neon API POST /branches failed: 422"))]) {
    const t = await routeWrite(false, branch);
    assert.ok("refused" in t, "refused");
    assert.match(t.refused, /Not saved/);
  }
  const limit = await routeWrite(false, async () => Promise.reject(new Error("Neon API POST /branches failed: 422")));
  assert.ok("refused" in limit && limit.refused.includes("422"), "the Neon reason reaches the UI");
});

test("a branch that resolves to main, or is not a session branch, is refused", async () => {
  assert.ok("refused" in (await routeWrite(false, async () => ({ uri: MAIN, name: "drill-x" }))));
  assert.ok("refused" in (await routeWrite(false, async () => ({ uri: BRANCH.uri, name: "main" }))));
  assert.ok("refused" in (await routeWrite(false, async () => ({ uri: BRANCH.uri, name: "snap-storm-hold" }))));
});

test("rate limit: 30 per window per key, then refused until the window passes", () => {
  const t0 = 1_000_000;
  for (let i = 0; i < 30; i++) assert.equal(allow("v1", 30, 60_000, t0 + i), true);
  assert.equal(allow("v1", 30, 60_000, t0 + 100), false);
  assert.equal(allow("v2", 30, 60_000, t0 + 100), true, "other visitors are not affected");
  assert.equal(allow("v1", 30, 60_000, t0 + 60_001), true);
});
