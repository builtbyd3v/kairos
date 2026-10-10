// What a water-model score means in plain words: "about 7 in 10 boxes at this score were real water".
// Fit on the CALIBRATION split only (fp32, 315 boxes at or above the 0.49 threshold), never on test.
// A box counts as real water if it overlaps a labeled puddle at IoU >= 0.25. Bands with n < 20 would merge.
// Test check and method: docs/model/water-v2/CONFIDENCE.md, script: docs/model/water-v2/confidence.py.

/** min inclusive, max exclusive (the last band includes 1). pct = calib precision rounded to the nearest 10. n = calib boxes. */
export const WATER_CONFIDENCE = [
  { min: 0.49, max: 0.55, pct: 50, n: 64 }, // 30/64 = 46.9% (95% CI 35.2-58.9)
  { min: 0.55, max: 0.65, pct: 60, n: 78 }, // 44/78 = 56.4% (45.4-66.9)
  { min: 0.65, max: 0.75, pct: 70, n: 65 }, // 47/65 = 72.3% (60.4-81.7)
  { min: 0.75, max: 1, pct: 90, n: 108 }, // 101/108 = 93.5% (87.2-96.8)
] as const;

/** Share of calib boxes in this score's band that were real water. null below the threshold or for a bad score. */
export function waterLikelihood(score: number): { pct: number; n: number } | null {
  const last = WATER_CONFIDENCE.length - 1;
  const band = WATER_CONFIDENCE.find((b, i) => score >= b.min && (score < b.max || (i === last && score <= b.max)));
  return band ? { pct: band.pct, n: band.n } : null;
}
