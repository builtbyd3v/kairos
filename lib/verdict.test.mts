// Run: npm test. Checks the dispatcher rules on hand-built cases.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, type Weather } from "./verdict.ts";

const now = new Date("2025-05-05T18:00:00Z");
const end = new Date("2025-05-05T18:45:00Z");
const healthy = { batteryPct: 90, routeRisk: [] };
const calm: Weather = {
  fetchedAt: now.toISOString(),
  alerts: [],
  steps: [{ time: now.toISOString(), precipMmPerHour: 0, thunderPct: 5, gustKmh: 20, tempC: 29 }],
};

test("calm weather and a full battery is GO", () => {
  assert.equal(decide(calm, healthy, { now, start: now, end }, false).verdict, "GO");
});

test("missing or stale weather never looks green", () => {
  assert.equal(decide(null, healthy, { now, start: now, end }, false).verdict, "HOLD");
  const stale = { ...calm, fetchedAt: new Date(now.getTime() - 3600000).toISOString() };
  assert.equal(decide(stale, healthy, { now, start: now, end }, false).verdict, "HOLD");
});

test("a warning holds before launch and recalls during a mission", () => {
  const storm = { ...calm, alerts: ["Severe Thunderstorm Warning"] };
  assert.equal(decide(storm, healthy, { now, start: now, end }, false).verdict, "HOLD");
  assert.equal(decide(storm, healthy, { now, start: now, end }, true).verdict, "RECALL");
});

test("light rain is GO with a caution, heavier rain is a hazard", () => {
  const light = { ...calm, steps: [{ ...calm.steps[0], precipMmPerHour: 1 }] };
  const heavy = { ...calm, steps: [{ ...calm.steps[0], precipMmPerHour: 8 }] };
  const l = decide(light, healthy, { now, start: now, end }, false);
  assert.equal(l.verdict, "GO");
  assert.ok(l.reasons.some((r) => r.text.includes("Light rain")));
  assert.equal(decide(heavy, healthy, { now, start: now, end }, true).verdict, "RECALL");
});

test("weather after Spot is back on the dock does not count", () => {
  const later = { ...calm, steps: [...calm.steps, { time: "2025-05-05T20:00:00Z", precipMmPerHour: 20, thunderPct: 90, gustKmh: 80, tempC: 29 }] };
  assert.equal(decide(later, healthy, { now, start: now, end }, false).verdict, "GO");
});

test("low battery holds even in good weather", () => {
  assert.equal(decide(calm, { ...healthy, batteryPct: 30 }, { now, start: now, end }, false).verdict, "HOLD");
});
