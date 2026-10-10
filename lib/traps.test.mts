// Run: npm test. Recomputes the data traps from NextEra's kit files and checks them against docs/nextera/SUMMARY.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEvents } from "./live.ts";
import { dataTraps } from "./traps.ts";

const csv = (name: string) => {
  const [header, ...lines] = readFileSync(`data/kit/${name}.csv`, "utf8").trim().split(/\r?\n/);
  const keys = header.split(",");
  return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [keys[i], v])));
};

// note: only the fields dataTraps reads; loadKit maps the same columns from Neon.
const kit = {
  missions: csv("missions").map((r) => ({ id: r.mission_id, status: r.mission_status })),
  actions: csv("actions").map((r) => ({ id: r.action_id, locationId: r.location_id, assetId: r.asset_id, battery: Number(r.battery_pct), ok: r.status === "SUCCESS", config: r.configuration_version })),
  anomalies: csv("anomalies").map((r) => ({ actionId: r.action_id })),
  assets: csv("assets").map((r) => ({ id: r.asset_id, location: r.location_id })),
  readings: csv("readings").map((r) => ({ actionId: r.action_id })),
} as unknown as Parameters<typeof dataTraps>[0];
const events = parseEvents(readFileSync("data/kit/replay.ndjson", "utf8"));
const t = Object.fromEntries(dataTraps(kit, events).map((x) => [x.id, x]));

test("V1 vs V2: V2 never below 40%, and V2 still wins inside the same battery band", () => {
  assert.match(t.battery.meaning, /never ran below 52%/); // lowest V2 action battery; SUMMARY rounds this to "never below 40%"
  assert.match(t.battery.meaning, /40-59%: 85% vs 100%; 60-79%: 86% vs 92%/);
});

test("61 of 270 actions log a location that is not the asset's home", () => assert.equal(t.location.figure, "61 of 270"));
test("50 actions have no reading", () => assert.equal(t.readings.figure, "50 of 270"));
test("replay covers 23 of 27 missions, stops in M023, has no MISSION_FAILED", () => {
  assert.equal(t.replay.figure, "23 of 27 missions");
  assert.match(t.replay.meaning, /\(M023\)/);
  assert.match(t.replay.meaning, /It has 0 MISSION_FAILED/);
});
test("8 of 40 anomalies come from successful actions", () => assert.equal(t.anomalies.figure, "8 of 40"));
