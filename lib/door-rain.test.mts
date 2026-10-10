// Run: npm test. Checks the dock-door fused rule: camera + observed + forecast rain into GO / HOLD.
import { test } from "node:test";
import assert from "node:assert/strict";
import { doorVerdict, DOOR_RAIN_THRESHOLD, type DoorInput } from "./door-rain.ts";

const dry: DoorInput = { camera: { pRain: 0.01, status: "ok" }, weather: { observedRain: false, forecastRain: false } };
const v = (camera: Partial<DoorInput["camera"]>, weather: Partial<DoorInput["weather"]> = {}) =>
  doorVerdict({ camera: { ...dry.camera, ...camera }, weather: { ...dry.weather, ...weather } });

test("all sources known and dry is GO", () => {
  const r = doorVerdict(dry);
  assert.equal(r.verdict, "GO");
  assert.equal(r.reasons.length, 3);
});

test("camera p(rain) at or above the threshold holds; just below does not", () => {
  assert.equal(v({ pRain: DOOR_RAIN_THRESHOLD }).verdict, "HOLD");
  assert.equal(v({ pRain: 0.99 }).verdict, "HOLD");
  assert.equal(v({ pRain: DOOR_RAIN_THRESHOLD - 0.001 }).verdict, "GO");
});

test("observed rain or forecast rain holds on its own", () => {
  assert.equal(v({}, { observedRain: true }).verdict, "HOLD");
  assert.equal(v({}, { forecastRain: true }).verdict, "HOLD");
});

test("any unknown evidence holds", () => {
  assert.equal(v({ pRain: null }).verdict, "HOLD");
  assert.equal(v({ status: "stale" }).verdict, "HOLD");
  assert.equal(v({ status: "error" }).verdict, "HOLD");
  assert.equal(v({ pRain: Number.NaN }).verdict, "HOLD");
  assert.equal(v({}, { observedRain: null }).verdict, "HOLD");
  assert.equal(v({}, { forecastRain: null }).verdict, "HOLD");
});

test("a confident dry camera never turns a weather HOLD into GO", () => {
  const r = v({ pRain: 0 }, { forecastRain: true });
  assert.equal(r.verdict, "HOLD");
  assert.deepEqual(r.reasons, ["Rain forecast for the round"]);
  assert.equal(v({ pRain: 0 }, { observedRain: true, forecastRain: null }).verdict, "HOLD");
});

test("every HOLD cause is listed", () => {
  const r = v({ pRain: 0.9 }, { observedRain: true, forecastRain: null });
  assert.equal(r.reasons.length, 3);
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
