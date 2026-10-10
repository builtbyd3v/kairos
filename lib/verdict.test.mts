// Run: npm test. Checks the dispatcher rules on hand-built cases.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, type Weather } from "./verdict.ts";

const now = new Date("2025-05-05T18:00:00Z");
const end = new Date("2025-05-05T18:45:00Z");
const healthy = { outdoor: true, batteryPct: 90, projectedEndPct: 60, routeRisk: [] };
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

test("a projected dock battery under 20% holds even in good weather", () => {
  assert.equal(decide(calm, { ...healthy, projectedEndPct: 12 }, { now, start: now, end }, false).verdict, "HOLD");
});

test("an indoor route stays GO through a storm", () => {
  const storm = { ...calm, alerts: ["Severe Thunderstorm Warning"] };
  assert.equal(decide(storm, { ...healthy, outdoor: false }, { now, start: now, end }, true).verdict, "GO");
  assert.equal(decide(null, { ...healthy, outdoor: false }, { now, start: now, end }, false).verdict, "GO");
});

test("an outdoor window with no observations holds", () => {
  const empty = { ...calm, steps: [{ time: now.toISOString(), precipMmPerHour: null, thunderPct: null, gustKmh: null, tempC: null }] };
  assert.equal(decide(empty, healthy, { now, start: now, end }, false).verdict, "HOLD");
});

test("a warning and the thunder it implies count once", () => {
  const storm = { ...calm, alerts: ["Severe Thunderstorm Warning"], steps: [{ ...calm.steps[0], thunderPct: 100 }] };
  const r = decide(storm, healthy, { now, start: now, end }, true);
  assert.equal(r.reasons.filter((x) => x.verdict === "RECALL").length, 1);
});

test("only outdoor weather holding the round offers an indoor-only GO", () => {
  const storm = { ...calm, alerts: ["Severe Thunderstorm Warning"], steps: [{ ...calm.steps[0], thunderPct: 100, gustKmh: 70 }] };
  const r = decide(storm, healthy, { now, start: now, end }, false);
  assert.equal(r.verdict, "HOLD");
  assert.equal(r.indoorOnly?.verdict, "GO");
});

test("no indoor-only GO when battery, unknown weather, a site-wide alert, or a live mission blocks it", () => {
  const gusty = { ...calm, steps: [{ ...calm.steps[0], gustKmh: 70 }] };
  const window = { now, start: now, end };
  assert.equal(decide(gusty, { ...healthy, projectedEndPct: 12 }, window, false).indoorOnly, null);
  assert.equal(decide(null, healthy, window, false).indoorOnly, null);
  assert.equal(decide({ ...gusty, fetchedAt: new Date(now.getTime() - 3600000).toISOString() }, healthy, window, false).indoorOnly, null);
  assert.equal(decide({ ...gusty, alerts: ["Tornado Warning"] }, healthy, window, false).indoorOnly, null);
  assert.equal(decide(gusty, healthy, window, true).indoorOnly, null);
  assert.equal(decide(calm, healthy, window, false).indoorOnly, null); // already GO
});
