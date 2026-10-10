// Run: npm test. Checks the dock-door fused rule: wet ground in the door frame + rain now + rain next hour into GO / HOLD.
import { test } from "node:test";
import assert from "node:assert/strict";
import { doorVerdict, type DoorInput } from "./door-rain.ts";

const dry: DoorInput = { camera: { wetGround: false, status: "ok" }, weather: { observedRain: false, forecastRain: false } };
const v = (camera: Partial<DoorInput["camera"]>, weather: Partial<DoorInput["weather"]> = {}) =>
  doorVerdict({ camera: { ...dry.camera, ...camera }, weather: { ...dry.weather, ...weather } });

test("all sources known and dry is GO with no operator check", () => {
  const r = doorVerdict(dry);
  assert.equal(r.verdict, "GO");
  assert.equal(r.operatorCheck, null);
  assert.equal(r.reasons.length, 3);
});

test("puddles at the door ask the operator; they do not hold", () => {
  const r = v({ wetGround: true });
  assert.equal(r.verdict, "GO");
  assert.match(r.operatorCheck ?? "", /Puddles/);
});

test("advisory rain classifier: fp32 scores map onto the q8 scale at the threshold", async () => {
  const { fp32ToQ8Scale, DOOR_RAIN_THRESHOLDS: t } = await import("./door-rain.ts");
  assert.equal(fp32ToQ8Scale(t.fp32), t.q8);
  assert.equal(fp32ToQ8Scale(0), 0);
  assert.equal(fp32ToQ8Scale(1), 1);
});

test("observed rain or forecast rain holds on its own", () => {
  assert.equal(v({}, { observedRain: true }).verdict, "HOLD");
  assert.equal(v({}, { forecastRain: true }).verdict, "HOLD");
});

test("any unknown evidence holds", () => {
  // An unchecked or failed camera is not weather: it asks the operator to look instead of holding.
  for (const c of [{ wetGround: null }, { status: "stale" as const }, { status: "error" as const }]) {
    const r = v(c);
    assert.equal(r.verdict, "GO");
    assert.ok(r.operatorCheck);
  }
  assert.equal(v({}, { observedRain: null }).verdict, "HOLD");
  assert.equal(v({}, { forecastRain: null }).verdict, "HOLD");
});

test("dry ground never turns a weather HOLD into GO", () => {
  const r = v({ wetGround: false }, { forecastRain: true });
  assert.equal(r.verdict, "HOLD");
  assert.deepEqual(r.reasons, ["Rain forecast for the round"]);
  assert.equal(v({ wetGround: false }, { observedRain: true, forecastRain: null }).verdict, "HOLD");
});

test("every weather HOLD cause is listed, and puddles still ask the operator", () => {
  const r = v({ wetGround: true }, { observedRain: true, forecastRain: null });
  assert.equal(r.verdict, "HOLD");
  assert.equal(r.reasons.length, 2);
  assert.ok(r.operatorCheck);
});

test("doorWeather: no feed or no step in a window is unknown", async () => {
  const { doorWeather } = await import("./door-rain.ts");
  const now = new Date("2026-10-10T20:00:00Z");
  assert.deepEqual(doorWeather(null, now), { observedRain: null, forecastRain: null });
  const steps = [
    { time: "2026-10-10T19:50:00Z", precipMmPerHour: 0 },
    { time: "2026-10-10T20:30:00Z", precipMmPerHour: 1.2 },
  ];
  assert.deepEqual(doorWeather({ steps }, now), { observedRain: false, forecastRain: true });
  assert.deepEqual(doorWeather({ steps: [] }, now), { observedRain: null, forecastRain: null });
});

test("doorWeather: a trace below 0.25 mm/h is not rain at the door", async () => {
  const { doorWeather } = await import("./door-rain.ts");
  const now = new Date("2026-10-10T20:00:00Z");
  const steps = [
    { time: "2026-10-10T20:00:00Z", precipMmPerHour: 0.08 },
    { time: "2026-10-10T20:30:00Z", precipMmPerHour: 0.3 },
  ];
  assert.deepEqual(doorWeather({ steps }, now), { observedRain: false, forecastRain: true });
});
