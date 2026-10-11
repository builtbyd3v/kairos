# Water detector v3: results (not shipped)

- **Decision: v3 does NOT ship. v2 stays at Hub commit `54c3bb4`.** No v3 weights were pushed to `builtbyd3v/kairos-water-rtdetr`.
- Best v3 candidate (picked on calib only) is worse than v2 on held-out test (q8): water boxes found 37.4% (323/864) vs 48.1% (416/864). Tiny boxes found 1.8% (1/57) vs 7.0% (4/57).
- False alarms did not rise (SCAND 4/172 both; Kaggle dry 15/579 vs 17/579). But the gain came from a higher cutoff (0.63 vs 0.49), so wet recall dropped.
- Industrial-like test slice (q8) is also worse: boxes found 35.8% (158/441) vs 49.4% (218/441). Wet frames flagged 62.0% (176/284) vs 86.3% (245/284).
- Bigger input costs browser time. WebGPU fp32 on M4 Pro Chrome, median of 10 runs: 640 = 101 ms, 800 = 135 ms, 960 = 165 ms. Only 640 and 800 are under 150 ms. HF Jobs spend: about $4.97 of free credits.

## What was tried

All runs start from v2 (`builtbyd3v/kairos-water-rtdetr@54c3bb4`). They use the same data, the same splits and the same test set as v2 (`pack2`: 1,351 test frames, 864 test boxes, 57 tiny). Script: `train.py`.

| Run | Input | Recipe | GPU | Best val mAP@0.5 (n = 799) |
|---|---|---|---|---|
| A 800 | 800, multi-scale 640-832 | copy-paste tiny water onto dry train frames + mosaic + plant-like frames 3x | L4, 8 epochs | 0.342 (v2 weights at 800: 0.313) |
| A 960 | 960, multi-scale 768-1024 | same as A 800 | A100, 12 epochs | 0.339 (v2 weights at 960: 0.226) |
| B 800 | 800 | A without copy-paste | L4, 8 epochs | 0.343 |
| B 960 | 960 | A without copy-paste | A100, 10 epochs | 0.334 |
| B 800 @ 640 | 640 | B 800 weights, run at 640 | none | not measured |

- "Plant-like frames 3x": indoor spills (`slipp/spill_detection`, 861 frames), Mendeley Indoor (5), and SCAND Spot frames (132). In run A, half of the pasted crops were indoor spills.
- v2 reached val mAP@0.5 0.365 at 640. Val is mostly Mendeley. It did not predict calib or test well here.

## Calib (used to pick; fp32; threshold = lowest cutoff with calib dry alarms <= 5 per 100)

| Model | Threshold | Boxes found IoU>=0.5 (n = 394) | Tiny found IoU>=0.25 (n = 20) | pwwbs wet flagged (n = 230) |
|---|---|---|---|---|
| v2 (shipped) | 0.49 | 197 | 1 | 184 |
| A 800 | 0.66 | 82 | 2 | 70 |
| A 960 | 0.65 | 72 | 0 | 56 |
| B 800 | 0.60 | 107 | 0 | 100 |
| B 960 | 0.58 | 93 | 0 | 90 |
| **B 800 @ 640 (picked)** | 0.63 | 150 | 0 | 143 |

The pick rule (most calib boxes found) chose B 800 @ 640. Every candidate is below v2 on calib.

## Test: v2 vs picked v3 (q8, as shipped)

| Metric | v2 (0.49) | v3 picked (0.63) | n |
|---|---|---|---|
| Water boxes found, IoU >= 0.5 | 48.1% (416) | 37.4% (323) | 864 boxes |
| Water boxes found, IoU >= 0.25 | 56.7% (490) | 41.8% (361) | 864 boxes |
| Tiny boxes found, IoU >= 0.5 | 7.0% (4) | 1.8% (1) | 57 boxes |
| Tiny boxes found, IoU >= 0.25 | 8.8% (5) | 1.8% (1) | 57 boxes |
| Box precision, IoU >= 0.5 | 62.7% (416/664) | 71.9% (323/449) | all test detections |
| Wet frames flagged, pwwbs (unseen source) | 84.9% (461) | 64.1% (348) | 543 frames |
| Wet frames flagged, Kaggle wet | 91.2% (52) | 64.9% (37) | 57 frames |
| False alarms per 100 SCAND (dry) | 2.3 (4) | 2.3 (4) | 172 frames |
| False alarms per 100 Kaggle dry | 2.9 (17) | 2.6 (15) | 579 frames |

## Test: industrial-like slice (q8)

| Metric | v2 | v3 picked | n |
|---|---|---|---|
| Water boxes found, IoU >= 0.5 | 49.4% (218) | 35.8% (158) | 441 boxes |
| Tiny boxes found, IoU >= 0.25 | 8.1% (3) | 0.0% (0) | 37 boxes |
| Wet frames flagged (pwwbs + Kaggle) | 86.3% (245) | 62.0% (176) | 284 frames |
| False alarms per 100 SCAND indoor | 2.4 (4) | 2.4 (4) | 165 frames |
| False alarms per 100 Kaggle dry | 3.8 (13) | 2.9 (10) | 339 frames |

Run A on test (reported because the rules said so; picked by no rule): A 800 found 195/864 boxes and 0/57 tiny, with false alarms of 9/172 SCAND and 41/579 Kaggle dry. A 960 found 161/864 boxes and 0/57 tiny, with 13/172 SCAND and 32/579 Kaggle dry.

## Ship rule check

- Rule: tiny recall at least 2x v2 (8/57 or more), OR box recall above 416/864. Also, SCAND and Kaggle dry false alarms per 100 must each rise by no more than 1.0.
- Picked v3: tiny 1/57 (no). Boxes 323/864 (no). False alarms OK. Industrial-like slice: worse, not "clearly improves". **Does not qualify.**

## Why it failed (what the numbers show)

- Copy-paste (run A) taught the model that small blobs are water. Its top calib false alarms were tiny boxes on tiles, a red logo, and manholes. Kaggle dry alarms at 0.49 went from 21/379 (v2) to 85/379 (A 800).
- Without paste (run B), dry frames still fire more than v2. The calib cutoff had to rise to 0.58-0.63, and that cut wet recall. Most likely causes: mosaic, and the shift in sampling weights. Neither was tested alone (no budget left).
- Bigger input alone does not help this model. v2 weights at 800 and 960, untrained, also found fewer calib boxes (141 and 117 of 394) at their own calib cutoffs.
- Tiny water stays the weak spot. The test has only 57 tiny boxes, all outdoor. The calib split has 20, too few to steer training.

## Rules fixed before looking at results

- Same data, splits, test set and eval logic as v2. Threshold re-picked on calib. Ship rule as above.
- 800 vs 960 pick on calib only. Run B and the 640 candidate were added after seeing run A 800's calib numbers only. Each addition is a separate commit (`f406219`, `6e997dc`), made before its numbers existed.
- Industrial-like slice: `industrial_tags.json`, tagged by eye before any v3 result. The rule is in the file: a hard, man-made surface that is not a traffic road and not mud, soil or grass. 284 wet frames, 504 dry frames (339 Kaggle dry, 165 SCAND indoor). Kaggle dry frames were tagged per 40-frame scene from one frame.

## Limits

- One seed per run, and no ablations (mosaic alone, weights alone).
- Browser speed was measured with v2-weight exports at each size (same graph and FLOPs as v3). Runs vary: with a busy CPU, the same page gave 215 / 240 / 339 ms.
- The industrial-like tags are one person's judgement, made by eye on thumbnails.
- v2 re-scored with this script on Hub `54c3bb4` gives 416/864 boxes (RESULTS v2: 417, on the pre-fix `85f7cfa` ONNX). Everything else matches.

## Files

- `train.py`: v3 training (env: SIZE, PASTE, UPWEIGHT, BUDGET_MIN, TAG). `evaluate.py`: the v2 eval, without the v1 baseline, plus the industrial slice and a `CALIB_ONLY=1` mode for picking. `compare.py`: v2 vs v3 rows and the ship check.
- `fix_onnx.py`: float64 to float32 fix plus int8 quantization (the v2 fix). `node-check.mjs`: loads a Hub revision in Node. `webgpu-speed.html`: browser timing page.
- `tag_sheets.py`, `tag_industrial.py`, `industrial_tags.json`: the industrial-like slice. `results.json`: all metrics (no per-frame dump).
- Weights of all four runs are in the PRIVATE staging repo `builtbyd3v/kairos-water-v3-staging` (`s800`, `s960`, `b800`, `b960`). Delete it if not needed.

## Cost

HF Jobs: L4 at $0.80/h, A100 at $2.50/h. A 960 on L4 was canceled at 12% and moved to A100 (about $0.21). Then A 800 L4 $0.56, A 960 A100 $1.94, B 960 A100 $1.70, B 800 L4 $0.56. Total about $4.97, from running seconds per job (canceled job estimated from timestamps).
