// Loads a water model revision from the Hub with @huggingface/transformers in Node (CPU), the same calls as lib/water-model.ts,
// and decodes with the shipped decode(). Run from the repo root:
// node --experimental-strip-types docs/model/water-v3/node-check.mjs <revision> <threshold> <dtype q8|fp32> <image> [<image> ...]
import { AutoModel, AutoProcessor, RawImage } from "@huggingface/transformers";
import { decode, WATER_MODEL_ID } from "../../../lib/water-model.ts";

const [revision, thr, dtype, ...imgs] = process.argv.slice(2);
const processor = await AutoProcessor.from_pretrained(WATER_MODEL_ID, { revision });
const model = await AutoModel.from_pretrained(WATER_MODEL_ID, { revision, dtype });
console.log("model", WATER_MODEL_ID, revision, dtype, "threshold", thr, "input", JSON.stringify(processor.image_processor.size));
for (const img of imgs) {
  const { pixel_values } = await processor(await RawImage.read(img));
  const ms = [];
  let out;
  for (let i = 0; i < 4; i++) { // first run is warm-up
    const t0 = performance.now();
    out = await model({ pixel_values });
    ms.push(Math.round(performance.now() - t0));
  }
  const dets = decode(out.logits.data, out.pred_boxes.data, Number(thr));
  console.log(img, `runs ms ${ms.join(",")}`, dets.length, "boxes",
    JSON.stringify(dets.slice(0, 5).map((d) => ({ score: +d.score.toFixed(3), areaFrac: +d.areaFrac.toFixed(4) }))));
}
