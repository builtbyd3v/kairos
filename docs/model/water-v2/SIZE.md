# Water detector v2: recall by puddle size

- Bigger water is found more often. fp32, IoU >= 0.5: under 1% of the frame 10.5% (6/57), 1-5% 33.7% (60/178), 5-15% 57.2% (107/187), over 15% 56.3% (249/442).
- At frame level, once the largest puddle covers 1% of the frame or more, 83-86% of wet frames are flagged (fp32: 43/52, 110/128, 359/417).
- Frames where ALL water is tiny are rare: 3 of 600 wet test frames. fp32 flags 1 of 3, int8 0 of 3. Every other tiny box shares its frame with a bigger puddle.
- int8 matches fp32 except on the smallest water: under 1%, 4/57 vs 6/57; 1-5%, 59/178 vs 60/178.
- Industrial-like slice (indoor and hard man-made floors) has the same shape: fp32 under 1% 3/37, 1-5% 36/108, 5-15% 52/102, over 15% 126/194.

## Setup

- Model: `builtbyd3v/kairos-water-rtdetr` at Hub commit `54c3bb4` (the shipped revision), fp32 and int8 ONNX.
- Same test split, threshold (0.49, picked on calib), decode and matching as `RESULTS.md`. Nothing here was tuned on test.
- Size = ground-truth box area (w x h) as a share of the frame. Buckets: under 1%, 1-5%, 5-15%, over 15%.
- Box columns: a ground-truth box counts as found if an unused detection at or above 0.49 overlaps it at the IoU shown.
- Frame column: wet test frames (pwwbs + Kaggle wet, 600 frames) grouped by the size of their LARGEST water box. Flagged = any detection at or above 0.49.
- Script: `docs/model/water-v3/evaluate.py` (the `by_size` field). Raw output: `results_tta.json` (`test_fp32`, `test_q8`, `test_industrial_*`).
- Re-run check: the overall numbers match `RESULTS.md` (fp32 422/864 boxes, 463/543 pwwbs, 2/172 SCAND) and the v2 row of `docs/model/water-v3/RESULTS.md` (int8 416/864).

## Full test split (864 boxes, 600 wet frames)

| Size bucket | fp32 found, IoU >= 0.5 | fp32 found, IoU >= 0.25 | int8 found, IoU >= 0.5 | int8 found, IoU >= 0.25 |
|---|---|---|---|---|
| under 1% | 10.5% (6/57) | 14.0% (8/57) | 7.0% (4/57) | 8.8% (5/57) |
| 1-5% | 33.7% (60/178) | 42.7% (76/178) | 33.1% (59/178) | 39.3% (70/178) |
| 5-15% | 57.2% (107/187) | 63.6% (119/187) | 55.6% (104/187) | 62.0% (116/187) |
| over 15% | 56.3% (249/442) | 67.2% (297/442) | 56.3% (249/442) | 67.6% (299/442) |

| Largest puddle in the frame | fp32 wet frames flagged | int8 wet frames flagged |
|---|---|---|
| under 1% | 1/3 | 0/3 |
| 1-5% | 82.7% (43/52) | 78.8% (41/52) |
| 5-15% | 85.9% (110/128) | 85.9% (110/128) |
| over 15% | 86.1% (359/417) | 86.8% (362/417) |

## Industrial-like slice (441 boxes, 284 wet frames)

Slice from `docs/model/water-v3/industrial_tags.json` (tagged by eye before any v3 or TTA test result).

| Size bucket | fp32 found, IoU >= 0.5 | fp32 found, IoU >= 0.25 | int8 found, IoU >= 0.5 | int8 found, IoU >= 0.25 |
|---|---|---|---|---|
| under 1% | 8.1% (3/37) | 10.8% (4/37) | 5.4% (2/37) | 8.1% (3/37) |
| 1-5% | 33.3% (36/108) | 45.4% (49/108) | 33.3% (36/108) | 42.6% (46/108) |
| 5-15% | 51.0% (52/102) | 56.9% (58/102) | 51.0% (52/102) | 54.9% (56/102) |
| over 15% | 64.9% (126/194) | 74.2% (144/194) | 66.0% (128/194) | 75.8% (147/194) |

| Largest puddle in the frame | fp32 wet frames flagged | int8 wet frames flagged |
|---|---|---|
| under 1% | 1/1 | 0/1 |
| 1-5% | 80.6% (29/36) | 80.6% (29/36) |
| 5-15% | 85.5% (53/62) | 85.5% (53/62) |
| over 15% | 87.0% (161/185) | 88.1% (163/185) |

## Reading

- "Over 15%" box recall (56%) is not higher than 5-15% (57%). Likely cause (not measured): large puddles have vague edges, so labelers and the model draw different outlines and IoU >= 0.5 is hard there. At IoU >= 0.25, recall rises with size as expected (67%).
- The tiny gap is real but small in frame terms: only 3 of 600 wet frames depend on tiny water alone. The risk is a lone small spill on a clean plant floor, which this test set barely contains (1 such industrial frame).
- Wet-frame recall per bucket for "under 1%" has n = 3 (n = 1 on the slice). Do not quote it as a rate.
