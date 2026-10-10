# Door rain model: results

- Published (public): https://huggingface.co/builtbyd3v/kairos-door-rain. ConvNeXt-tiny, rain vs no_rain, ONNX fp32 + q8 for transformers.js, card, scripts.
- In-source calibration (1,053 images, 111 rain): q8 at threshold 0.786 catches 95.5% of rain (106/111) with 0.4% false alarms (4/942).
- Held-out source (2,600 dashcam road photos, 595 rain): AUROC 0.544, rain recall 46.1% (274/595), false alarms 43.7% (876/2,005). Close to a coin flip. The dima806 baseline is no better (AUROC 0.567).
- So the camera is caution-only: `doorVerdict` in `lib/door-rain.ts` lets it add a HOLD, never remove one. NWS / Open-Meteo rain holds on its own; unknown evidence holds.
- Not yet tested on a Spot door view. No HF Jobs spend: trained locally on Apple MPS in about 20 minutes.

## The fused rule (lib/door-rain.ts)

`doorVerdict({ camera: { pRain, status }, weather: { observedRain, forecastRain } })` returns GO only when all three sources are known and dry:

| Evidence | Effect |
|---|---|
| camera pRain >= 0.786 | HOLD |
| observedRain true | HOLD |
| forecastRain true | HOLD |
| camera stale / error / null / not in 0-1 | HOLD (unknown) |
| observedRain or forecastRain null | HOLD (unknown) |
| all known and dry | GO |

Every HOLD cause is listed in `reasons`. Tests: `lib/door-rain.test.mts` (6 tests, `npm test`).

## Metrics

95% CIs are Wilson score intervals. Scored with onnxruntime CPU on the shipped ONNX files (`evaluate.py`; raw output `eval_results.json`).
Threshold rule: the highest threshold that keeps calibration rain recall >= 95% (favors rain recall).

**Calibration split** (in-source, never trained on): 1,053 images (111 rain, 942 no_rain)

| Weights | Threshold | Rain recall | False alarms | Accuracy |
|---|---|---|---|---|
| fp32 | 0.770 | 95.5% (106/111, CI 89.9-98.1) | 0.4% (4/942, CI 0.2-1.1) | 99.1% |
| q8 (shipped) | 0.786 | 95.5% (106/111, CI 89.9-98.1) | 0.4% (4/942, CI 0.2-1.1) | 99.1% |

**Held-out source test**: Weather-Time road images, 2,600 (595 rainy, 2,005 sunny or cloudy). Never used for training or the threshold.

| Model | AUROC | Rain recall | False alarm rate | Accuracy |
|---|---|---|---|---|
| Always "no_rain" | 0.5 | 0.0% (0/595) | 0.0% (0/2,005) | 77.1% |
| Baseline dima806/weather_types_image_detection (ViT, Apache-2.0), p(rain) >= 0.5 | 0.567 | 53.4% (318/595, CI 49.4-57.4) | 41.9% (840/2,005, CI 39.8-44.1) | 57.0% |
| Baseline at its own 95%-recall calibration threshold (0.168) | 0.567 | 75.1% (447/595) | 82.7% (1,658/2,005) | 30.5% |
| Ours fp32, t=0.770 | 0.546 | 44.0% (262/595, CI 40.1-48.1) | 40.6% (815/2,005, CI 38.5-42.8) | 55.9% |
| **Ours q8, t=0.786 (shipped)** | **0.544** | **46.1% (274/595, CI 42.1-50.1)** | **43.7% (876/2,005, CI 41.5-45.9)** | **54.0%** |
| Ours v1 (WIR only) q8, t=0.277 | not computed | 51.1% (304/595, CI 47.1-55.1) | 54.2% (1,086/2,005, CI 52.0-56.3) | 47.0% |

Note: the baseline was trained on the same Kaggle source as ours (same 11 classes), so its calibration-split numbers may include its own training images. Only its held-out row is fair.

## Data sources and licenses

| Source | License (checked 2026-10-10) | Used as | Images |
|---|---|---|---|
| Xiao, H. (2021). Weather phenomenon database (WEAPD). Harvard Dataverse, doi:10.7910/DVN/M8JQCR. Kaggle `jehanbhathena/weather-dataset` | CC0 1.0 (Kaggle page and Dataverse API) | `rain` = rain (526); `no_rain` = dew, fogsmog, frost, glaze, rainbow, rime, sandstorm, snow. Hail (591) and lightning (377) skipped as ambiguous. | 5,894 |
| Ajayi, G. (2018). Multi-class Weather Dataset for Image Classification. Mendeley Data V1, doi:10.17632/4drtyfjtfy.1. Kaggle `pratik2901/multiclass-weather-dataset` | CC BY 4.0 (attribution given here and in the card) | `rain` = Rain (215); `no_rain` = Cloudy, Shine, Sunrise | 1,125 |
| Kaggle `wjybuqi/weathertime-classification-with-road-images` (CCF BDCI contest data) | CC0 1.0 on Kaggle; upstream contest terms not checked | Test only. Labeled `train_dataset` (Rainy = rain; Cloudy, Sunny = no_rain). Its `test_dataset` has no labels, so it is unused. | 2,600 |

## Split

Pool = WIR + MWD (7,019). `train_test_split` 70 / 15 / 15 stratified by source class, seed 0.

| Split | rain | no_rain | Total | Used for |
|---|---|---|---|---|
| train | 519 | 4,394 | 4,913 | weights |
| val | 111 | 942 | 1,053 | best epoch (accuracy) |
| calib | 111 | 942 | 1,053 | threshold |
| test (Weather-Time) | 595 | 2,005 | 2,600 | final numbers only |

## Known limits

- No Spot door frames exist in any split. The held-out source result says scene-level weather photos do not transfer to a new camera. Expect the same at the dock door until we score real frames.
- Scraped photos have no scene ids, so near-duplicates may cross train and calib. Calibration numbers are likely optimistic.
- Weather-Time photos are through a windshield (wiper streaks, wet road). A fixed door camera is a different view again.
- Night, glare, a dirty lens, and drizzle are untested.

## What failed or changed

- v1 trained on WIR only. WIR has no clear or cloudy class, so we suspected the model learned "rain vs exotic weather". Adding MWD (cloudy, shine, sunrise) improved calibration false alarms (1.2% to 0.4%) but not the held-out source. Shipped v2 anyway: it saw more ordinary scenes.
- HF Jobs not used: local MPS finished each run in 14-20 minutes, so cost was $0.
- `train.py` and `export_onnx.py` are the v1 wet-floor scripts with only the labels changed. `quantize.py` repeats the v1 q8 recipe (MatMul/Gemm only). `prepare.py` and `evaluate.py` are new.

## Reproduce

```bash
# venv: torch transformers accelerate scikit-learn pillow huggingface_hub onnx onnxscript onnxruntime (Python 3.14)
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
