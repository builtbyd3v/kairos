// Run: npm test. Checks the storm replay on the real 2024-05-19 St. Lucie fixture.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findRecall, stateAt, weatherAt, type StormFixture } from "./replay.ts";

const f: StormFixture = JSON.parse(readFileSync("data/replay/storm-2024-05-19.json", "utf8"));
const route = ["WP01", "WP12", "WP06", "WP07"];
const round = {
  launch: Date.parse("2024-05-19T12:00:00-04:00"),
  durationMin: 25,
  route,
  health: { outdoor: true, batteryPct: 92, projectedEndPct: 60, routeRisk: [] },
  returnMin: Object.fromEntries(route.map((id) => [id, 2])),
};

test("no hindsight: the replay never sees observations or alerts from the future", () => {
  const t = Date.parse("2024-05-19T12:30:00-04:00");
  const w = weatherAt(f, t);
  assert.ok(w.steps.every((s) => Date.parse(s.time) <= t));
  assert.ok(!w.alerts.includes("Severe Thunderstorm Warning"), "the 12:47 warning is not known at 12:30");
});

test("the pop-up storm forces a recall mid-round, before the NWS warning", () => {
  const recall = findRecall(f, round);
  assert.ok(recall !== null);
  assert.ok(recall < Date.parse("2024-05-19T12:47:00-04:00"));
});

test("after docking, the next round is held while the storm is active", () => {
  assert.equal(stateAt(f, round, Date.parse("2024-05-19T13:00:00-04:00")).verdict, "HOLD");
  assert.equal(stateAt(f, round, Date.parse("2024-05-19T13:00:00-04:00")).phase, "docked");
});

test("the indoor-only option leaves the storm drill unchanged: recall at 12:15, held after docking", () => {
  assert.equal(findRecall(f, round), Date.parse("2024-05-19T12:15:00-04:00"));
  assert.equal(stateAt(f, round, Date.parse("2024-05-19T12:16:00-04:00")).verdict, "RECALL");
});
