// Run: npm test. Checks the live round on NextEra's real replay stream.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { endOf, kitMs, liveState, outdoorArrival, parseEvents, STREAM_TIMEOUT_MS, type LiveAnomaly } from "./live.ts";

const all = parseEvents(readFileSync("data/kit/replay.ndjson", "utf8"));
const anomalies: LiveAnomaly[] = readFileSync("data/kit/anomalies.csv", "utf8")
  .trim()
  .split("\n")
  .slice(1)
  .map((line) => {
    const [id, actionId, , , , , type, severity] = line.split(",");
    return { id, actionId, type, severity };
  });
const of = (id: string) => all.filter((e) => e.missionId === id);
const m001 = of("M001");

test("at mission start: nothing inspected yet, battery from MISSION_STARTED", () => {
  const s = liveState(m001, kitMs("2026-09-01T18:00:00"), anomalies, []);
  assert.equal(s.phase, "starting");
  assert.equal(s.done, 0);
  assert.equal(s.truth, "CLEAN");
  assert.equal(s.battery, 82);
  assert.equal(s.reported, "IN PROGRESS");
});

test("after the first failed action the mission is DEGRADED live", () => {
  const s = liveState(m001, kitMs("2026-09-01T18:03:06"), anomalies, []);
  assert.equal(s.phase, "inspecting");
  assert.equal(s.current?.locationId, "WP05");
  assert.equal(s.failed, 1);
  assert.equal(s.results.A0001, "failed");
  assert.equal(s.truth, "DEGRADED");
});

test("at the end the robot reports COMPLETED while the truth is worse", () => {
  const s = liveState(m001, endOf(m001), anomalies, []);
  assert.equal(s.phase, "done");
  assert.equal(s.reported, "COMPLETED");
  assert.equal(s.done, m001.filter((e) => e.type === "ACTION_STARTED").length);
  assert.notEqual(s.truth, "CLEAN");
  assert.equal(s.battery, 15);
});

test("M023 has no completion event: the stream reads as lost after the timeout", () => {
  const m023 = of("M023");
  const last = m023.at(-1)!.at;
  assert.equal(liveState(m023, last, anomalies, []).phase, "inspecting");
  assert.equal(liveState(m023, last + STREAM_TIMEOUT_MS, anomalies, []).phase, "stream ended");
});

test("anomalies are never revealed before their action finishes", () => {
  let checked = 0;
  for (const id of new Set(all.map((e) => e.missionId))) {
    const events = of(id);
    for (const e of events) {
      for (const t of [e.at - 1, e.at]) {
        for (const a of liveState(events, t, anomalies, []).anomalies) {
          const finish = events.find((x) => x.actionId === a.actionId && x.type !== "ACTION_STARTED");
          assert.ok(finish && finish.at <= t, `${a.id} revealed before ${a.actionId} finished`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 0);
});

test("floor check triggers when Spot first reaches the outdoor leg (WP01), not before", () => {
  const before = liveState(m001, kitMs("2026-09-01T18:15:29"), anomalies, []);
  assert.equal(outdoorArrival(before.events, ["WP01"]), undefined);
  const at = liveState(m001, kitMs("2026-09-01T18:15:30"), anomalies, []);
  assert.equal(outdoorArrival(at.events, ["WP01"])?.actionId, "A0005");
});
