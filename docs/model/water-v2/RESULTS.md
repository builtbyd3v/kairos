# Water detector v2: results

- Model: RT-DETRv2-R18 fine-tuned to one class, `water`. It returns boxes, so Kairos can say where the water is and how big. Public: https://huggingface.co/builtbyd3v/kairos-water-rtdetr. Browser: `lib/water-model.ts`, int8 ONNX, 21.5 MB.
- Held-out test (sources and scenes never trained on, 1,351 frames, q8 as shipped): 84.9% of wet frames flagged (461/543 unseen-source puddle photos). False alarms: 2.3 per 100 real Spot frames (4/172, SCAND), 2.9 per 100 Kaggle dry frames (17/579).
- Box level: 48.3% of water boxes found at IoU >= 0.5 (417/864). Precision 62.7% (417/665).
- Weak spot: tiny water (< 1% of the frame) is mostly missed. Recall 7.0% (4/57 boxes, q8) and 10.5% (6/57, fp32). Do not claim tiny-puddle detection yet.
- Against v1 (ConvNeXt classifier) on the same unseen frames, v2 is not better at "is there water": 84.9% vs 88.2% wet-frame recall, 4 vs 2 SCAND false alarms out of 172. v2 adds location and size. Advisory only.

## Setup

- Base: `PekingU/rtdetr_v2_r18vd` (Apache-2.0, COCO). New 1-class head. Input 640x640 (stretch), no normalization, same as the base preprocessor.
- Training: HF Jobs, 1x L4, 18 epochs, batch 16, AdamW (backbone lr 1e-5, rest 1e-4), cosine, bf16. 65 minutes. Best epoch by val mAP@0.5 = 0.365 (epoch 16 of 18; val n = 799 frames).
- Augmentation: flip, color jitter, zoom-in crops, and zoom-out (the photo pasted at 40-100% scale on a gray 640 canvas). Zoom-out makes water smaller than in the source photos, for small-object practice.
- Tiles: tested, not shipped. Full frame + 4 overlapping 60% tiles, merged by NMS, threshold re-picked on calib (0.68). On test it was worse everywhere: tiny recall 0/57, wet-frame recall 55.8% (303/543), SCAND false alarms 10.5 per 100 (18/172). Tiles see more surfaces that look like water, so the cutoff had to rise.
- Post-processing (same in eval and browser): sigmoid score per query, keep score >= threshold, greedy NMS at IoU 0.5. Note: the transformers.js `object-detection` pipeline drops every box of a 1-class model (softmax, then skips the last class), so `lib/water-model.ts` decodes the raw outputs itself.
- Export: `torch.onnx.export`, opset 17, input `pixel_values`, outputs `logits` + `pred_boxes`. PyTorch vs ONNX max diff: logits 4e-5, boxes 3e-5. q8 = onnxruntime `quantize_dynamic`, uint8 weights, all ops (ConvInteger + MatMulInteger).

- Hub commit: `85f7cfa5bb8d6b0e5169a7f79dd33830ae2ecd32`.
- Node check (`node-check.mjs`, shipped loader, Hub q8, CPU, M4 Pro): loads, 1 box on each wet bench image (score 0.65 and 0.81, 29% and 21% of the frame), 0 boxes on the dry street image and the kit pipe-gallery image. Warm inference about 95 ms per frame.

## Rules fixed before looking at test

- Threshold: the lowest cutoff whose CALIB dry-frame alarm rate is <= 5 per 100 (Kaggle dry + SCAND pooled, fp32). Result: **0.49**. Calib: 21/379 Kaggle dry (5.5), 2/81 SCAND (2.5), pooled 23/460 = 5.0 per 100.
- A water box counts as found if a detection overlaps it at IoU >= 0.5. Also shown at IoU >= 0.25, because puddle edges are vague and labelers draw them differently.
- Tiny = box area < 1% of the frame. At 640 input that is under about 64x64 px.
- Frame alarm = any detection at or above the threshold. False alarms per 100 = alarm frames / dry frames x 100.

## Data and splits

All splits are by source or scene group, never by single image. A script check fails if any scene group appears in two splits. Calib and test come from sources the model never trained on, except Kaggle, where whole 40-frame blocks are held out.

| Source | License | Role | Train | Val | Calib | Test |
|---|---|---|---|---|---|---|
| Mendeley V4, stagnant water + wet surface (Bhutad and Patil 2021, doi:10.17632/y6zyrnxbfm.4) | CC BY 4.0 | wet | 1,815 | 159 | 0 | 0 |
| Roboflow `slipp/spill_detection` v4, class `water` only | CC BY 4.0 | wet (indoor spills, web images) | 861 | 81 | 0 | 0 |
| Roboflow `hk-hsse/puddle-qrpyh` v1 | CC BY 4.0 | wet (street puddles) | 2,889 | 334 | 0 | 0 |
| Roboflow `projects-pwwbs/water-puddle-joyj6` v1, one copy per original photo | CC BY 4.0 | wet, **unseen source** | 0 | 0 | 230 (23 scenes) | 543 (58 scenes) |
| Kaggle Dist-YOLO (Mahesa), `puddle` boxes | CC0 1.0 | wet / dry, 40-frame blocks | 87 / 1,986 | 56 / 169 | 42 / 379 | 57 (2 scenes) / 579 (15 scenes) |
| SCAND, real Spot camera (Karnan et al., doi:10.18738/T8/0PRYRH) | CC0 1.0 | dry, whole bags | 132 (RLM, Welch) | 0 | 81 (Parlin) | 172 (Union, SAC) |

- SCAND test bags are the glossiest floors in the sample: polished slate (Union) and shiny terrazzo (SAC). 27 SCAND frames that show a "wet floor" sign were removed, not used as dry.
- Dropped: Roboflow `torp-training/water-spill-detection` (110 images, 11 labels: too few).
- Known label noise: Kaggle frames without a `puddle` box can still show wet ground, so some Kaggle "false alarms" may be real water.

## Test metrics (threshold 0.49, never tuned on test)

95% CIs are Wilson score intervals.

| Metric | q8 (shipped) | fp32 | n |
|---|---|---|---|
| Water boxes found, IoU >= 0.5 | 48.3% (44.9-51.6), 417 | 48.8% (45.5-52.2), 422 | 864 boxes |
| Water boxes found, IoU >= 0.25 | 56.8% (53.5-60.1), 491 | 57.9%, 500 | 864 boxes |
| Tiny boxes (< 1% of frame) found, IoU >= 0.5 | 7.0% (2.8-16.7), 4 | 10.5% (4.9-21.1), 6 | 57 boxes |
| Tiny boxes found, IoU >= 0.25 | 8.8% (3.8-18.9), 5 | 14.0% (7.3-25.3), 8 | 57 boxes |
| Box precision, IoU >= 0.5 | 62.7% (59.0-66.3), 417/665 | 62.1%, 422/680 | all test frames |
| Wet frames flagged, unseen-source puddles (pwwbs) | 84.9% (81.6-87.7), 461 | 85.3%, 463 | 543 frames, 58 scenes |
| Wet frames flagged, Kaggle wet | 91.2% (81.1-96.2), 52 | 87.7%, 50 | 57 frames, 2 scenes |
| **False alarms per 100 SCAND Spot frames (dry)** | **2.3 (0.9-5.8), 4** | 1.2 (0.3-4.1), 2 | 172 frames, 2 bags |
| **False alarms per 100 Kaggle dry frames** | **2.9 (1.8-4.7), 17** | 3.3 (2.1-5.1), 19 | 579 frames, 15 scenes |

## q8 vs fp32

- 36 of 1,351 test frames (2.7%) change alarm state between fp32 and q8. Max change of the top score in a frame: 0.28.
- Net effect is mixed: q8 has 2 fewer Kaggle dry alarms, 2 more SCAND alarms, 2 more Kaggle wet hits, and 2 fewer tiny hits (4 vs 6).
- Not tested: MatMul-only q8 (convs fp32). v1 found it closer to fp32. Try it if q8 parity matters more than size.

## Baseline: v1 ConvNeXt classifier, same frames

v1 = `builtbyd3v/spot-wetfloor-convnext-tiny` q8, p(wet) > 0.5. v2 = any box at 0.49. Only test frames v1 never trained or tuned on (556 of 1,351 excluded: v1 trained on most Kaggle frames).

| Frames | n | v1 flagged | v2 flagged |
|---|---|---|---|
| pwwbs wet (unseen by both) | 543 | 479 (88.2%) | 461 (84.9%) |
| Kaggle wet (v1 test split) | 40 | 37 (92.5%) | 38 (95.0%) |
| Kaggle dry (v1 test split) | 40 | 0 | 0 |
| SCAND dry (unseen by both) | 172 | 2 (1.2 per 100) | 4 (2.3 per 100) |

Reading: v1 is at least as good at the yes/no question. v2's gain is the box: where the water is and how much of the frame it covers. That is what the live round needs for "in the path" and size.

## Operating points on test (for the demo, not for choosing the threshold)

From each test frame's top q8 score, rounded to 3 decimals (so the 0.49 row can differ by 1 frame from the table above).

| Cutoff | pwwbs wet flagged (543) | Kaggle wet (57) | Kaggle dry alarms (579) | SCAND alarms (172) |
|---|---|---|---|---|
| 0.30 | 533 | 57 | 48 | 30 |
| 0.40 | 511 | 55 | 26 | 14 |
| 0.49 | 462 | 52 | 17 | 4 |
| 0.60 | 351 | 44 | 7 | 0 |
| 0.70 | 235 | 28 | 6 | 0 |

## Demo walk frames (Kaggle scene k:13, test split, `images/002474`-`002482`)

q8 at 0.49: 8 of 8 wet frames flagged, 0 alarms on the 1 frame with no puddle box. Boxes found: 6/8 at IoU >= 0.5, 8/8 at IoU >= 0.25. All 8 puddles there cover 1.9-28.7% of the frame, so none is "tiny". n = 9 frames from 1 scene: a demo check, not a metric.

## Known limits

- Tiny water (< 1% of the frame) is the stated goal and the model mostly misses it (4/57). Only 57 tiny test boxes exist, from outdoor sources. No indoor plant floors, no tiny spills on industrial floors.
- No NextEra or plant frames in any split. SCAND is real Spot footage but on a university campus. Kit images were not used.
- Kaggle wet test is 2 scenes, so its CI is wider than shown.
- Calib threshold was picked on fp32 and used for q8 as shipped.
- Browser resize (transformers.js) is not byte-identical to the Python processor used in eval. Expect small score differences in the browser.
- "No box" never means "dry". An operator confirms every route.

## Reproduce

Scripts in this folder. Data download as in `docs/model/RESULTS.md` (Mendeley, Kaggle), Roboflow COCO exports via API key (`rf_dl` step: `slipp/spill_detection/4`, `hk-hsse/puddle-qrpyh/1`, `projects-pwwbs/water-puddle-joyj6/1`), SCAND frames by byte-range reads of 5 Spot bags (`/image_raw/compressed`).

```bash
python -I prepare.py <mendeley> <kaggle_distyolo> <roboflow_dir> <scand_dir> pack   # labels.jsonl + images/
tar -cf pack.tar -C pack labels.jsonl images && hf upload builtbyd3v/kairos-water-v2-data <dir with pack.tar> . --repo-type dataset
hf jobs uv run --flavor l4x1 --secrets HF_TOKEN --timeout 2h train.py builtbyd3v/kairos-water-v2-data builtbyd3v/kairos-water-rtdetr 18
TILES=1 python -I evaluate.py pack <v2 model dir> <v1 model dir> <v1 manifest.csv> results.json
node --experimental-strip-types docs/model/water-v2/node-check.mjs public/bench/test-wet-surface.jpg   # from repo root
```

Cost: 3 HF Jobs runs on L4 at $0.80/h: smoke 4m33s, smoke 5m05s, full run 1h08m. About 78 minutes, about $1.04 of free credits.
