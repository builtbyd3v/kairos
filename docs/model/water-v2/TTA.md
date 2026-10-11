# Water detector v2: test-time augmentation and tiles (not shipped)

- **Decision: nothing ships. The browser keeps one plain pass per frame (v2 at `54c3bb4`, threshold 0.49). No product code changed.**
- Flip TTA (original + mirrored, 2 passes): fewer false alarms but lower recall. int8 test: SCAND 0/172 vs 4/172, Kaggle dry 13/579 vs 17/579, but wet frames 490/600 vs 513/600, boxes 400/864 vs 416/864, tiny 2/57 vs 4/57.
- Tiles (full frame + 2x2 tiles at 20% overlap, 5 passes): worse on everything that matters. int8 test: tiny 1/57 vs 4/57, boxes 274/864, SCAND false alarms 19/172 vs 4/172.
- Tiles + flip (6 passes): tiny 0/57 (int8), 1/57 (fp32), SCAND 18/172 (int8). Also fails.
- Why: each extra pass adds false alarms on dry calib frames, so the calib rule raises the cutoff (0.49 to 0.55, 0.67, 0.68) and recall falls. Tiles also see more shiny surfaces up close. The tiny-water gap needs training data, not inference tricks.

## Method (fixed before looking at test)

- Model: `builtbyd3v/kairos-water-rtdetr` at `54c3bb4`, fp32 and int8 ONNX, the files the browser loads.
- Flip: the 640x640 input tensor is mirrored left to right, boxes from that pass are un-mirrored (x -> 1 - x - w), and both passes are merged by the same greedy NMS at IoU 0.5 (highest score wins).
- Tiles: full frame plus four 60% crops at offsets 0 and 0.4 (a 2x2 grid with 20% overlap), each resized to 640, boxes mapped back to frame coordinates, merged by the same NMS. Tiles + flip = flip result plus the same 4 tile passes. A 3x3 grid was not run (the 2x2 grid already lost on every recall metric).
- Threshold per variant: the same rule as v2, on the calib split only (lowest cutoff with calib dry alarms <= 5 per 100, fp32), then reused for int8.
- Ship rule: wet-frame recall, box recall, or (for tiles) tiny recall must improve, AND false alarms per 100 on SCAND and Kaggle dry must each rise by no more than 0.5. Checked for int8 and fp32.
- Test: same 1,351 frames, 864 boxes, 57 tiny boxes as `RESULTS.md`. Script: `docs/model/water-v3/evaluate.py` with `TTA=1 TILES=1`. Output: `results_tta.json`. CPU, onnxruntime 1.31, about an hour locally on an M4 Pro, $0.

## Calib (used to pick the thresholds; fp32)

| Variant | Threshold | Boxes found IoU >= 0.5 (n = 394) | pwwbs wet flagged (n = 230) | SCAND alarms (n = 81) | Kaggle dry alarms (n = 379) |
|---|---|---|---|---|---|
| v2, 1 pass | 0.49 | 197 | 184 | 2 | 21 |
| Flip | 0.55 | 184 | 180 | 4 | 19 |
| Tiles | 0.67 | 138 | 135 | 5 | 18 |
| Tiles + flip | 0.68 | 144 | 143 | 5 | 18 |

## Test, int8 (as shipped on WASM)

| Metric | v2 (0.49) | Flip (0.55) | Tiles (0.67) | Tiles + flip (0.68) | n |
|---|---|---|---|---|---|
| Water boxes found, IoU >= 0.5 | 48.1% (416) | 46.3% (400) | 31.7% (274) | 35.3% (305) | 864 boxes |
| Water boxes found, IoU >= 0.25 | 56.7% (490) | 54.1% (467) | 39.0% (337) | 42.4% (366) | 864 boxes |
| Tiny boxes found, IoU >= 0.5 | 7.0% (4) | 3.5% (2) | 1.8% (1) | 0.0% (0) | 57 boxes |
| Tiny boxes found, IoU >= 0.25 | 8.8% (5) | 3.5% (2) | 1.8% (1) | 0.0% (0) | 57 boxes |
| Box precision, IoU >= 0.5 | 62.7% (416/664) | 67.5% (400/593) | 41.9% (274/654) | 45.3% (305/673) | all test detections |
| Wet frames flagged, pwwbs | 84.9% (461) | 81.0% (440) | 58.2% (316) | 61.9% (336) | 543 frames |
| Wet frames flagged, Kaggle wet | 91.2% (52) | 87.7% (50) | 63.2% (36) | 64.9% (37) | 57 frames |
| False alarms per 100 SCAND | 2.3 (4) | 0.0 (0) | 11.0 (19) | 10.5 (18) | 172 frames |
| False alarms per 100 Kaggle dry | 2.9 (17) | 2.2 (13) | 2.9 (17) | 2.9 (17) | 579 frames |

## Test, fp32 (as shipped on WebGPU)

| Metric | v2 (0.49) | Flip (0.55) | Tiles (0.67) | Tiles + flip (0.68) | n |
|---|---|---|---|---|---|
| Water boxes found, IoU >= 0.5 | 48.8% (422) | 46.3% (400) | 31.8% (275) | 34.7% (300) | 864 boxes |
| Water boxes found, IoU >= 0.25 | 57.9% (500) | 54.4% (470) | 39.0% (337) | 41.9% (362) | 864 boxes |
| Tiny boxes found, IoU >= 0.5 | 10.5% (6) | 3.5% (2) | 1.8% (1) | 1.8% (1) | 57 boxes |
| Tiny boxes found, IoU >= 0.25 | 14.0% (8) | 5.3% (3) | 1.8% (1) | 1.8% (1) | 57 boxes |
| Box precision, IoU >= 0.5 | 62.1% (422/680) | 67.5% (400/593) | 41.4% (275/665) | 44.2% (300/679) | all test detections |
| Wet frames flagged, pwwbs | 85.3% (463) | 80.7% (438) | 58.6% (318) | 63.0% (342) | 543 frames |
| Wet frames flagged, Kaggle wet | 87.7% (50) | 84.2% (48) | 64.9% (37) | 64.9% (37) | 57 frames |
| False alarms per 100 SCAND | 1.2 (2) | 0.0 (0) | 8.1 (14) | 8.1 (14) | 172 frames |
| False alarms per 100 Kaggle dry | 3.3 (19) | 2.6 (15) | 3.5 (20) | 3.1 (18) | 579 frames |

## Boxes found by size, IoU >= 0.5 (buckets as in `SIZE.md`)

| Size bucket | v2 fp32 | Flip fp32 | Tiles fp32 | Tiles + flip fp32 | v2 int8 | Flip int8 | Tiles int8 | Tiles + flip int8 |
|---|---|---|---|---|---|---|---|---|
| under 1% (57) | 6 | 2 | 1 | 1 | 4 | 2 | 1 | 0 |
| 1-5% (178) | 60 | 52 | 29 | 33 | 59 | 51 | 29 | 33 |
| 5-15% (187) | 107 | 100 | 69 | 76 | 104 | 100 | 72 | 78 |
| over 15% (442) | 249 | 246 | 176 | 190 | 249 | 247 | 172 | 194 |

## Ship rule check

| Variant | Recall up? | SCAND rise per 100 | Kaggle dry rise per 100 | Verdict |
|---|---|---|---|---|
| Flip, int8 | No (wet 490 vs 513 of 600, boxes 400 vs 416, tiny 2 vs 4) | -2.3 | -0.7 | does not ship |
| Flip, fp32 | No (wet 486 vs 513, boxes 400 vs 422, tiny 2 vs 6) | -1.2 | -0.7 | does not ship |
| Tiles, int8 | No (tiny 1 vs 4) | +8.7 | 0.0 | does not ship |
| Tiles, fp32 | No (tiny 1 vs 6) | +7.0 | +0.2 | does not ship |
| Tiles + flip, int8 | No (tiny 0 vs 4) | +8.1 | 0.0 | does not ship |
| Tiles + flip, fp32 | No (tiny 1 vs 6) | +7.0 | -0.2 | does not ship |

No browser timing was taken: nothing qualified, so no TTA or tile code was added to `lib/water-model.ts`.

## Worth knowing

- Flip is a cleaner operating point, not a better detector: at 0.55 it had 0 SCAND alarms on test (0/172), and precision rose to 67.5%. A plain single pass at a higher cutoff may do the same at half the cost (`RESULTS.md` operating points: 0.60 gives 0/172 SCAND with 351/543 pwwbs). Not tested as a rule; the threshold stays 0.49.
- The calib SCAND set is small (81 frames). Flip went from 2 to 4 calib alarms there, part of why its cutoff rose from 0.49 to 0.55 (the rule pools SCAND and Kaggle dry, 460 frames).
- Tiles were also tried for v2 (`RESULTS.md`, int8 only, cutoff picked on tiled int8). Same conclusion with this cleaner rerun.
