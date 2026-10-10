# Water detector v2: what a score means

- A raw score is not a probability. Kairos shows "about N in 10 boxes at this score were real water", from the table below (`lib/water-confidence.ts`).
- Fit on the CALIBRATION split only (fp32, 315 boxes). The test split was used once, as a check.
- The test check holds: every band's test rate falls within its calib 95% CI, except 0.55-0.65 (test 68.2% vs calib CI upper 66.9%; the shipped 60% understates it).
- Highest band (score >= 0.75): 93.5% real water on calib (n = 108), 93.9% on test (n = 229).
- Lowest band (0.49-0.55): about a coin flip, 46.9% calib, 43.5% test. Show these as "check by eye", not as "water".

## Method

- Model: fixed ONNX files with the same outputs as Hub revision `54c3bb4` (`WATER_REVISION`). fp32 is what WebGPU runs; int8 is what WASM runs.
- Decode: same as `lib/water-model.ts` (sigmoid, NMS at IoU 0.5). Only boxes at or above the shipped threshold 0.49 count.
- A box is real water if it overlaps an unused labeled water box at IoU >= 0.25 (puddle edges are vague), greedy by score.
- Bands fixed before the run: [0.49, 0.55), [0.55, 0.65), [0.65, 0.75), [0.75, 1]. Rule: merge a band with n < 20 into its neighbor. None needed merging.
- 95% CI: Wilson score interval. Shipped pct = calib rate rounded to the nearest 10%.
- Data: `pack2/labels.jsonl` calib (732 frames: pwwbs 230, Kaggle 421, SCAND 81) and test (1,351 frames). Totals match RESULTS.md (calib 315 boxes, test fp32 680).
- Script: `docs/model/water-v2/confidence.py`.

## Calibration fit vs test check

| Score band | Calib fp32: real water | n | 95% CI | Shipped | Test fp32 | n | 95% CI | Test int8 | n | 95% CI |
|---|---|---|---|---|---|---|---|---|---|---|
| 0.49-0.55 | 46.9% (30) | 64 | 35.2-58.9 | 50% | 43.5% (64) | 147 | 35.8-51.6 | 39.7% (50) | 126 | 31.6-48.4 |
| 0.55-0.65 | 56.4% (44) | 78 | 45.4-66.9 | 60% | 68.2% (120) | 176 | 61.0-74.6 | 69.2% (126) | 182 | 62.2-75.5 |
| 0.65-0.75 | 72.3% (47) | 65 | 60.4-81.7 | 70% | 78.9% (101) | 128 | 71.0-85.1 | 79.1% (91) | 115 | 70.8-85.6 |
| 0.75-1 | 93.5% (101) | 108 | 87.2-96.8 | 90% | 93.9% (215) | 229 | 90.0-96.3 | 92.5% (223) | 241 | 88.5-95.2 |

Limits:
- Calib n is small (64 to 108 per band). The CIs are wide, about plus or minus 10 points.
- "Not real water" includes Kaggle label noise: some Kaggle frames show wet ground with no box. So these rates are a floor.
- The table says how often a box is right. It says nothing about missed water: tiny puddles (< 1% of the frame) are still mostly missed (RESULTS.md).
- Calib and test are outdoor puddle photos and indoor Spot frames. No Florida plant footage.

## Demo frames

All from the TEST split (never trained on, never used to pick the threshold). Each checked by eye. Scores measured on the saved JPEGs, the bytes the browser loads. Script: `docs/model/water-v2/demo_frames.py`.

- Wet walk (`public/captures/demo-wet.json`): one Kaggle scene (k:47), a road-shoulder walk, smallest puddle first. No single puddle is approached far to near in a clean test sequence (the walkway sequence k:13 is already `approach.json`), so the order is by puddle size.
- Small puddle: `demo-wet-0` (4.3% of the frame), found by fp32 and int8. Nothing under 1% is in the demo, because the model mostly misses those.
- Dry check (`public/captures/demo-dry.json`): 2 SCAND frames (camera on a real Spot robot) + 2 Kaggle dry walkways. Most SCAND test frames are polished floors with a wet-looking shine; these two were picked because they look dry.
- Door frames: `public/door/door-wet.jpg` (road shoulder by shops, Kaggle) and `public/door/door-dry2.jpg` (SCAND Spot just outside the SAC building, brick walkway). `door-dry2` is the same frame as `demo-dry-1`.

| Frame | Source, license | Original file | Size | Test split | Top fp32 | Top int8 | Boxes >= 0.49 fp32 / int8 | Smallest truth box |
|---|---|---|---|---|---|---|---|---|
| demo-wet-0 | Kaggle Dist-YOLO, CC0 1.0 | gambar-1915-_jpg.rf.b65501a2… | 608x608 | yes | 0.747 | 0.771 | 1 / 1 | 4.3% |
| demo-wet-1 | Kaggle Dist-YOLO, CC0 1.0 | gambar-1902-_jpg.rf.87283a35… | 608x608 | yes | 0.883 | 0.880 | 2 / 2 | 6.1% |
| demo-wet-2 | Kaggle Dist-YOLO, CC0 1.0 | gambar-1916-_jpg.rf.78197b56… | 608x608 | yes | 0.859 | 0.838 | 1 / 1 | 8.0% |
| demo-wet-3 | Kaggle Dist-YOLO, CC0 1.0 | gambar-1895-_jpg.rf.e0ed8b44… | 608x608 | yes | 0.877 | 0.886 | 1 / 1 | 11.4% |
| demo-wet-4 | Kaggle Dist-YOLO, CC0 1.0 | gambar-1906-_jpg.rf.22c0f3bb… | 608x608 | yes | 0.889 | 0.894 | 1 / 1 | 15.4% |
| demo-wet-5 | Kaggle Dist-YOLO, CC0 1.0 | gambar-1905-_jpg.rf.d7233b23… | 608x608 | yes | 0.908 | 0.912 | 1 / 1 | 32.1% |
| demo-dry-0 | SCAND (Union), CC0 1.0 | A_Spot_Union_Union_Wed_Nov_10_53_1636568870514485173 | 960x540 | yes | 0.085 | 0.082 | 0 / 0 | none |
| demo-dry-1 | SCAND (SAC, outdoor), CC0 1.0 | B_Spot_SAC_SAC_Wed_Nov_10_49_1636562765020056241 | 960x540 | yes | 0.102 | 0.100 | 0 / 0 | none |
| demo-dry-2 | Kaggle Dist-YOLO, CC0 1.0 | gambar-546-_jpg.rf.84ea9fbe… | 608x608 | yes | 0.079 | 0.081 | 0 / 0 | none |
| demo-dry-3 | Kaggle Dist-YOLO, CC0 1.0 | gambar-564-_jpg.rf.e6f31bd1… | 608x608 | yes | 0.051 | 0.066 | 0 / 0 | none |
| door-wet | Kaggle Dist-YOLO, CC0 1.0 | gambar-1898-_jpg.rf.cc5d61a0… | 608x608 | yes | 0.777 | 0.765 | 1 / 1 | 8.4% |
| door-dry2 | SCAND (SAC, outdoor), CC0 1.0 | B_Spot_SAC_SAC_Wed_Nov_10_49_1636562765020056241 | 960x540 | yes | 0.102 | 0.100 | 0 / 0 | none |

- URLs: Kaggle https://www.kaggle.com/datasets/muftirestumahesa/obstacles-in-public-spaces-for-dist-yolo, SCAND https://doi.org/10.18738/T8/0PRYRH.
- Kaggle frames are 608x608 at the source, so they are not upscaled. SCAND frames come from the 1280x720 originals, resized to 960x540.
- 5 of 6 wet frames sit in the top band (about 9 in 10 real water) in fp32 and int8. demo-wet-0 (the small puddle) is 0.747 in fp32 (70% band, WebGPU) and 0.771 in int8 (90% band, WASM), so its label can differ by device.
