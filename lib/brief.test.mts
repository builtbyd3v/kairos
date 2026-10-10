// Run: npm test. Checks the shift brief sentences carry the right computed numbers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildBrief, type BriefInput } from "./brief.ts";

// Real kit anomalies; the analysis part is a tiny fake because analyze() lives next to next/cache, which node cannot load.
const anomalies = readFileSync("data/kit/anomalies.csv", "utf8")
  .trim()
  .split("\n")
  .slice(1)
  .map((line) => {
    const [id, , , , , , , severity, review] = line.split(",");
    return { id, severity, reviewRequired: review === "True" };
  });

const base: BriefInput = {
  analysis: {
    totals: { missions: 27, reportedCompleted: 26, clean: 5 },
    sites: [
      { id: "WP01", name: "Main Entrance", ok: 9, total: 10 },
      { id: "WP09", name: "Turbine Hall South", ok: 16, total: 25 },
      { id: "WP99", name: "Never visited", ok: 0, total: 0 },
    ],
    bands: [{ all: { ok: 3, total: 11 } }],
    configs: [
      { config: "V1", minBattery: 12 },
      { config: "V2", minBattery: 30 },
    ],
  },
  anomalies,
  reviews: {},
  plan: {
    start: new Date("2026-10-10T22:00:00Z"),
    verdict: "GO",
    reasons: [{ text: "Route stays indoors, so weather does not gate it" }],
    weather: { alerts: [] },
  },
};

test("untriaged kit: every number computed", () => {
  const b = buildBrief(base);
  assert.equal(b[0], "26 of 27 rounds reported COMPLETED, but only 5 were clean.");
  assert.equal(b[1], "15 anomalies need review, 4 critical; 0 triaged so far.");
  assert.equal(b[2], "Worst location: WP09 Turbine Hall South, 64% of inspections OK.");
  assert.equal(b[3], "Battery: below 20%, inspections succeed 27% of the time; V1 rounds drop as low as 12%.");
  assert.equal(b[4], "Next round Sat 6:00 PM ET: GO. Route stays indoors, so weather does not gate it.");
  assert.equal(b[5], "No active weather alerts.");
});

test("triage moves anomalies out of review and counts work orders", () => {
  const b = buildBrief({ ...base, reviews: { AN014: { status: "work_order" }, AN002: { status: "acknowledged" } } });
  assert.equal(b[1], "13 anomalies need review, 3 critical; 2 triaged so far, 1 work order open.");
});

test("weather alerts and missing weather", () => {
  const alert = buildBrief({ ...base, plan: { ...base.plan, verdict: "HOLD", weather: { alerts: ["Flood Warning"] } } });
  assert.equal(alert[5], "Watch: Flood Warning.");
  assert.match(buildBrief({ ...base, plan: { ...base.plan, weather: null } })[5], /unavailable/);
});
