# Door rain model: results

> **Status (Sat Oct 10, evening): experiment, not used to gate Spot.** Kairos decides rain from NWS / Open-Meteo data. This model learned "gray sky" more than rain at a door (near chance on unseen cameras), so it does not hold or release anything in the app. The fused-rule section below describes an earlier version of `lib/door-rain.ts` and is kept for the record.

- Published (public): https://huggingface.co/builtbyd3v/kairos-door-rain. ConvNeXt-tiny, rain vs no_rain, ONNX fp32 + q8 for transformers.js. This is v3: retrained after a review found duplicate leakage and a batch-size mismatch.
- Calibration split (deduplicated, in-source, 1,033 images, 116 rain): q8 at threshold 0.4447 catches 95.7% of rain (111/116, CI 90.3-98.2) with 1.3% false alarms (12/917, CI 0.8-2.3). v2 reported 0.4% false alarms on a split with duplicates in it; that number was optimistic.
- Weather-Time road photos (2,600, 595 rain) are EXPLORATORY: they were seen during development and shaped v2's data choices. q8: AUROC 0.562, rain recall 46.6% (277/595), false alarms 37.7% (755/2,005). Afternoon rain recall is 3.9% (4/102). Close to a coin flip overall.
- So the camera is caution-only: `doorVerdict` in `lib/door-rain.ts` lets it add a HOLD, never remove one. NWS / Open-Meteo rain holds on its own; unknown evidence holds.
- Not yet tested on a Spot door view. No paid compute: trained locally on Apple MPS in about 14 minutes.

## What v3 fixed

| Review finding | Fix | Effect |
|---|---|---|
| Duplicate photos crossed splits (85 SHA-identical groups; 41 spanned train and calibration) | `prepare.py` groups images by 8x8 average hash (byte-identical files always share it) BEFORE the 70/15/15 split, so each group lands in one split. A self-check asserts no group crosses splits. | 7,019 pool images: 175 SHA-256 duplicate groups; 503 aHash groups (1,439 files, largest 82) merged. 21 groups (212 files) mix rain and no_rain labels; kept together, not dropped. |
| q8 was scored in batches of 32; the browser scores one image | `evaluate.py` scores fp32 and q8 one image per call. | v2 q8 threshold moves from 0.7861 (batch 32) to 0.7666 (batch 1) on the same split. Dynamic int8 quantizes activations per call, so batch size changes scores. |
| fp32 fallback used the q8 threshold | `evaluate.py` writes a threshold per dtype (`thresholds` in `eval_results.json`). `lib/door-rain.ts` keeps both; `classifyDoor` maps an fp32 score onto the q8 scale (monotone, fp32 threshold lands exactly on the q8 threshold). | `doorVerdict` stays one rule for either dtype. Test: "fp32 fallback scores hold exactly at the fp32 threshold". |
| Weather-Time was presented as held-out | Labeled exploratory everywhere. Scored per period with n. | Afternoon rain recall is near zero; the aggregate hid that. |

## The fused rule (lib/door-rain.ts)

`doorVerdict({ camera: { pRain, status }, weather: { observedRain, forecastRain } })` returns GO only when all three sources are known and dry:

| Evidence | Effect |
|---|---|
| camera pRain >= 0.4447 (q8 scale) | HOLD |
| observedRain true | HOLD |
| forecastRain true | HOLD |
| camera stale / error / null / not in 0-1 | HOLD (unknown) |
| observedRain or forecastRain null | HOLD (unknown) |
| all known and dry | GO |

Every HOLD cause is listed in `reasons`. Tests: `lib/door-rain.test.mts` (`npm test`).

## Metrics

95% CIs are Wilson score intervals. Scored with onnxruntime CPU on the shipped ONNX files, one image per call (`evaluate.py`; raw output `eval_results.json`).
Threshold rule: the highest threshold that keeps calibration rain recall >= 95%, rounded down to 4 decimals.

**Calibration split** (in-source, never trained on, deduplicated against train and val).

| Model | Split | Threshold | Rain recall | False alarms | Accuracy |
|---|---|---|---|---|---|
| v2 q8, batch 32 (was shipped) | v2 split, leaky, n=1,053 | 0.7861 | 95.5% (106/111, CI 89.9-98.1) | 0.4% (4/942, CI 0.2-1.1) | 99.1% |
| v2 q8, batch 1 | v2 split, leaky, n=1,053 | 0.7666 | 95.5% (106/111, CI 89.9-98.1) | 0.4% (4/942, CI 0.2-1.1) | 99.2% |
| v3 fp32, batch 1 | v3 split, deduped, n=1,033 | 0.4728 | 95.7% (111/116, CI 90.3-98.2) | 1.2% (11/917, CI 0.7-2.1) | 98.5% |
| **v3 q8, batch 1 (shipped)** | v3 split, deduped, n=1,033 | **0.4447** | **95.7% (111/116, CI 90.3-98.2)** | **1.3% (12/917, CI 0.8-2.3)** | **98.4%** |

The v2 and v3 calibration splits hold different images, so the false alarm rise (0.4% to 1.3%) is the leak removed plus a new model, not one alone.

**Weather-Time road images, exploratory (seen during development)**: 2,600 (595 rainy, 2,005 sunny or cloudy). Never trained on and never used for a threshold, but v1's score on it is why v2 added clear and cloudy scenes. Treat it as a development set, not a clean test.

| Model | AUROC | Rain recall | False alarm rate | Accuracy |
|---|---|---|---|---|
| Always "no_rain" | 0.5 | 0.0% (0/595) | 0.0% (0/2,005) | 77.1% |
| Baseline dima806/weather_types_image_detection (ViT, Apache-2.0), p(rain) >= 0.5 | 0.567 | 53.4% (318/595, CI 49.4-57.4) | 41.9% (840/2,005, CI 39.8-44.1) | 57.0% |
| Baseline at its own 95%-recall v3 calibration threshold (0.0842) | 0.567 | 84.5% (503/595, CI 81.4-87.2) | 91.4% (1,832/2,005, CI 90.1-92.5) | 26.0% |
| v2 q8, t=0.7861, batch 32 (was shipped) | 0.544 | 46.1% (274/595, CI 42.1-50.1) | 43.7% (876/2,005, CI 41.5-45.9) | 54.0% |
| v2 q8, t=0.7666, batch 1 | 0.543 | 46.2% (275/595, CI 42.2-50.2) | 43.7% (877/2,005, CI 41.6-45.9) | 54.0% |
| v3 fp32, t=0.4728 | 0.565 | 43.2% (257/595, CI 39.3-47.2) | 32.8% (657/2,005, CI 30.8-34.8) | 61.7% |
| **v3 q8, t=0.4447 (shipped)** | **0.562** | **46.6% (277/595, CI 42.6-50.6)** | **37.7% (755/2,005, CI 35.6-39.8)** | **58.7%** |

**Per period** (Weather-Time `period` field), exploratory, batch 1:

| Period | n (rain / no_rain) | v2 q8 rain recall | v2 q8 false alarms | v3 q8 rain recall | v3 q8 false alarms |
|---|---|---|---|---|---|
| Morning | 1,613 (449 / 1,164) | 55.9% (251/449, CI 51.3-60.4) | 40.0% (465/1,164, CI 37.2-42.8) | 55.7% (250/449, CI 51.1-60.2) | 33.3% (388/1,164, CI 30.7-36.1) |
| Afternoon | 829 (102 / 727) | 2.0% (2/102, CI 0.5-6.9) | 53.0% (385/727, CI 49.3-56.6) | 3.9% (4/102, CI 1.5-9.7) | 45.7% (332/727, CI 42.1-49.3) |
| Dusk | 124 (44 / 80) | 50.0% (22/44, CI 35.8-64.2) | 2.5% (2/80, CI 0.7-8.7) | 52.3% (23/44, CI 37.9-66.2) | 8.8% (7/80, CI 4.3-17.0) |
| Dawn | 34 (0 / 34) | no rain images | 73.5% (25/34, CI 56.9-85.4) | no rain images | 82.3% (28/34, CI 66.5-91.6) |

v3 fp32 per period is in `eval_results.json` (`fp32.test_by_period`). v2 batch-1 numbers: `eval_results_v2_batch1.json`.

Note: the baseline was trained on the same Kaggle source as ours (same 11 classes), so its calibration-split numbers may include its own training images. Only its Weather-Time rows are fair, and the baseline was scored in batches of 32 on MPS (it is not deployed).

## Data sources and licenses

| Source | License (checked 2026-10-10) | Used as | Images |
|---|---|---|---|
| Xiao, H. (2021). Weather phenomenon database (WEAPD). Harvard Dataverse, doi:10.7910/DVN/M8JQCR. Kaggle `jehanbhathena/weather-dataset` | CC0 1.0 (Kaggle page and Dataverse API) | `rain` = rain (526); `no_rain` = dew, fogsmog, frost, glaze, rainbow, rime, sandstorm, snow. Hail (591) and lightning (377) skipped as ambiguous. | 5,894 |
| Ajayi, G. (2018). Multi-class Weather Dataset for Image Classification. Mendeley Data V1, doi:10.17632/4drtyfjtfy.1. Kaggle `pratik2901/multiclass-weather-dataset` | CC BY 4.0 (attribution given here and in the card) | `rain` = Rain (215); `no_rain` = Cloudy, Shine, Sunrise | 1,125 |
| Kaggle `wjybuqi/weathertime-classification-with-road-images` (CCF BDCI contest data) | CC0 1.0 on Kaggle; upstream contest terms not checked | Exploratory evaluation only. Labeled `train_dataset` (Rainy = rain; Cloudy, Sunny = no_rain). Its `test_dataset` has no labels, so it is unused. | 2,600 |

## Split

Pool = WIR + MWD (7,019). Grouped by 8x8 average hash, then `train_test_split` 70 / 15 / 15 over groups, stratified by the first member's source class, seed 0.

| Split | rain | no_rain | Total | Used for |
|---|---|---|---|---|
| train | 513 | 4,433 | 4,946 | weights |
| val | 112 | 928 | 1,040 | best epoch (accuracy; epoch 3 of 4, val accuracy 98.9%) |
| calib | 116 | 917 | 1,033 | threshold per dtype |
| Weather-Time (exploratory) | 595 | 2,005 | 2,600 | reported numbers only |

## Known limits

- No Spot door frames exist in any split. Weather-Time says scene-level weather photos do not transfer to a new camera. Expect the same at the dock door until we score real frames.
- Afternoon dashcam rain is almost never caught (4/102). The model reads scenic rain cues (dark sky, streaks), not wet asphalt in daylight.
- 8x8 aHash catches exact copies and light re-encodes, not crops or rotations. It also over-merges look-alike scenes (largest group 82), which is safe for leakage. 194 Weather-Time images share an aHash with a training-pool image; not checked by eye, likely look-alike collisions across different cameras.
- Weather-Time is a windshield view (wiper streaks, wet road). A fixed door camera is a different view again.
- Night, glare, a dirty lens, and drizzle are untested.

## What failed or changed

- v1 trained on WIR only. WIR has no clear or cloudy class, so we suspected the model learned "rain vs exotic weather". Adding MWD improved calibration false alarms but not Weather-Time. That decision used Weather-Time, which is why it is now labeled exploratory.
- v2 calibration (0.4% false alarms) was measured on a split with duplicates crossing train and calibration, and with q8 scored in batches of 32. v3 fixes both.
- HF Jobs not used: local MPS finished each run in 14-20 minutes, so cost was $0.
- `train.py` and `export_onnx.py` are the v1 wet-floor scripts with only the labels changed. `quantize.py` repeats the v1 q8 recipe (MatMul/Gemm only). `prepare.py` and `evaluate.py` are new.

## Reproduce

```bash
# venv: torch transformers accelerate scikit-learn pillow numpy huggingface_hub onnx onnxscript onnxruntime (Python 3.14)
kaggle datasets download jehanbhathena/weather-dataset -p data/wir --unzip
kaggle datasets download pratik2901/multiclass-weather-dataset -p data/mwd --unzip
kaggle datasets download wjybuqi/weathertime-classification-with-road-images -p data/wt --unzip
python -I prepare.py data manifest.csv
python -I train.py manifest.csv out
python -I export_onnx.py out/model <any image>
python -I quantize.py out/model
python -I evaluate.py manifest.csv out/model eval_results.json
hf upload builtbyd3v/kairos-door-rain out/model .
```
