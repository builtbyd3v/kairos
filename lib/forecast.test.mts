// Run: npm test. Checks the 24-hour readiness forecast on hand-built weather.
import { test } from "node:test";
import assert from "node:assert/strict";
import { forecast, NO_DATA } from "./forecast.ts";
import type { Kit } from "./kit.ts";
import type { Weather } from "./verdict.ts";

const now = new Date("2026-10-10T13:30:00Z"); // 09:30 ET
const kit = {
  missions: [{ id: "M1", name: "Round", config: "V2", start: "", durationMin: 40, startBattery: 95, endBattery: 75, status: "COMPLETED" }],
  actions: ["WP01", "WP02"].map((locationId, i) => ({ id: `A${i}`, missionId: "M1", timestamp: "", locationId, assetId: "", type: "", battery: 90, ok: true, failureType: "", config: "V2" })),
  locations: ["WP01", "WP02", "WP15"].map((id, i) => ({ id, name: id, zone: "", floor: 1, x: i * 10, y: 0, environment: "" })),
  anomalies: [],
  assets: [],
  readings: [],
} as unknown as Kit;

const hour = (h: number) => new Date(Date.UTC(2026, 9, 10, 13 + h)).toISOString();
const calmStep = (h: number) => ({ time: hour(h), precipMmPerHour: 0, thunderPct: 5, gustKmh: 20, tempC: 28 });
const calm: Weather = { fetchedAt: now.toISOString(), alerts: [], steps: Array.from({ length: 26 }, (_, h) => calmStep(h)) };

test("three rounds at 10:00, 18:00 and 02:00 ET; a calm forecast is GO everywhere", () => {
  const f = forecast(calm, kit, now);
  assert.deepEqual(f.rounds.map((r) => r.start.toISOString()), ["2026-10-10T14:00:00.000Z", "2026-10-10T22:00:00.000Z", "2026-10-11T06:00:00.000Z"]);
  assert.equal(f.bands.length, 25); // a partial first hour, 23 full hours, a partial last hour
  assert.ok([...f.rounds, ...f.bands].every((s) => s.verdict === "GO"));
});

test("a warning-level hour holds the rounds that would be out in it", () => {
  const gusty = { ...calm, steps: calm.steps.map((s, h) => (h === 3 ? { ...s, gustKmh: 80 } : s)) }; // 16:00Z
  const f = forecast(gusty, kit, now);
  const at = (iso: string) => f.bands.find((b) => b.start.toISOString() === iso)!;
  assert.equal(at("2026-10-10T15:00:00.000Z").verdict, "GO");
  assert.equal(at("2026-10-10T16:00:00.000Z").verdict, "HOLD");
  assert.match(at("2026-10-10T16:00:00.000Z").reasons[0].text, /Gusts up to 80/);
  assert.ok(at("2026-10-10T16:00:00.000Z").indoorOnly, "gusts only block the outdoor leg");
});

test("hours past the forecast horizon hold, never GO", () => {
  const short = { ...calm, steps: calm.steps.slice(0, 12) }; // covers through 00:00Z
  const f = forecast(short, kit, now);
  const late = f.bands.filter((b) => b.start.getTime() >= Date.parse(hour(12)));
  assert.ok(late.length > 0);
  assert.ok(late.every((b) => b.verdict === "HOLD" && b.reasons.some((r) => r.text === NO_DATA)));
  assert.equal(f.rounds[2].verdict, "HOLD"); // the 02:00 ET round is past the horizon
});
