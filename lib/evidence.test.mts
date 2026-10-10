import assert from "node:assert/strict";
import { test } from "node:test";
import { recordDetection, type DetectionInput } from "./evidence.ts";

// No database here: valid input gets past validation and stops at the missing DATABASE_URL.
delete process.env.DATABASE_URL;

const ok: DetectionInput = {
  box: { x: 0.2, y: 0.5, w: 0.1, h: 0.05 },
  score: 0.91,
  areaFrac: 0.004,
  frameUri: "/samples/test-wet-public-space.jpg",
  frameSha256: "dd4174af00f1cbc04524ddeb38faad9abf2f55ed34bcab55e0ead9ead18aa150",
  source: "live",
  license: "CC0",
  waypoint: "WP07",
  modelId: "builtbyd3v/spot-wetfloor-convnext-tiny",
  modelRevision: "942bd9c786bcb4b0e3b1521c6763a88a66134e6e",
  weather: { precipMmPerHour: 0 },
  rulesVersion: "v2",
  verdict: "HOLD",
};

test("valid detection passes validation", async () => {
  await assert.rejects(recordDetection(ok), /DATABASE_URL/);
  await assert.rejects(recordDetection({ ...ok, waypoint: null, verdict: null, weather: null }), /DATABASE_URL/);
});

test("bad detections are refused before any write", async () => {
  const bad: [Partial<DetectionInput> | Record<string, unknown>, RegExp][] = [
    [{ score: 1.5 }, /bad score/],
    [{ score: Number.NaN }, /bad score/],
    [{ box: { x: 0.95, y: 0, w: 0.2, h: 0.1 } }, /bad box/],
    [{ box: { x: 0, y: 0, w: 0, h: 0.1 } }, /bad box/],
    [{ areaFrac: -0.1 }, /bad areaFrac/],
    [{ frameSha256: "abc" }, /bad frameSha256/],
    [{ frameUri: "javascript:alert(1)" }, /bad frameUri/],
    [{ frameUri: "//evil.example/x.jpg" }, /bad frameUri/],
    [{ verdict: "MAYBE" }, /bad verdict/],
    [{ waypoint: "WP 07; DROP" }, /bad waypoint/],
    [{ weather: { pad: "x".repeat(9000) } }, /bad weather/],
  ];
  for (const [patch, err] of bad) await assert.rejects(recordDetection({ ...ok, ...patch } as DetectionInput), err, JSON.stringify(patch).slice(0, 60));
});
