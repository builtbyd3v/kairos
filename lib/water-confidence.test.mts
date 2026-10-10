// Run: npm test. Checks the score -> "real water" band lookup.
import { test } from "node:test";
import assert from "node:assert/strict";
import { WATER_CONFIDENCE, waterLikelihood } from "./water-confidence.ts";
import { WATER_THRESHOLD } from "./water-model.ts";

test("bands start at the shipped threshold and tile 0.49-1 with no gaps", () => {
  assert.equal(WATER_CONFIDENCE[0].min, WATER_THRESHOLD);
  for (let i = 1; i < WATER_CONFIDENCE.length; i++) assert.equal(WATER_CONFIDENCE[i].min, WATER_CONFIDENCE[i - 1].max);
  assert.equal(WATER_CONFIDENCE.at(-1)?.max, 1);
  assert.ok(WATER_CONFIDENCE.every((b) => b.n >= 20));
});

test("band edges: min inclusive, max exclusive, 1 is in the top band", () => {
  assert.deepEqual(waterLikelihood(0.49), { pct: 50, n: 64 });
  assert.deepEqual(waterLikelihood(0.5499), { pct: 50, n: 64 });
  assert.deepEqual(waterLikelihood(0.55), { pct: 60, n: 78 });
  assert.deepEqual(waterLikelihood(0.7), { pct: 70, n: 65 });
  assert.deepEqual(waterLikelihood(0.75), { pct: 90, n: 108 });
  assert.deepEqual(waterLikelihood(1), { pct: 90, n: 108 });
});

test("below threshold or not a score is null", () => {
  for (const s of [0.48, 0, -1, 1.01, Number.NaN]) assert.equal(waterLikelihood(s), null);
});
