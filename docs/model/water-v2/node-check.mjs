// Proves the shipped loader (lib/water-model.ts) loads the Hub model in Node with @huggingface/transformers and returns boxes.
// Run from the repo root: node --experimental-strip-types docs/model/water-v2/node-check.mjs <image> [<image> ...]
import { detectWater, WATER_MODEL_ID, WATER_THRESHOLD } from "../../../lib/water-model.ts";

console.log("model", WATER_MODEL_ID, "threshold", WATER_THRESHOLD);
for (const img of process.argv.slice(2)) {
  const t0 = performance.now();
  const dets = await detectWater(img);
  console.log(img, `${Math.round(performance.now() - t0)} ms`, dets.length, "boxes",
    JSON.stringify(dets.slice(0, 5).map((d) => ({ ...d, score: +d.score.toFixed(3), areaFrac: +d.areaFrac.toFixed(4) }))));
}
