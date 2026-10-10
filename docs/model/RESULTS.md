# Wet-floor classifier: results

- Published (public): https://huggingface.co/builtbyd3v/spot-wetfloor-convnext-tiny. Includes safetensors, ONNX (`onnx/model.onnx`, for transformers.js), model card, and training scripts.
- Fine-tuned ConvNeXt-tiny: 99.6% accuracy and 99.1% wet recall on 752 held-out test images. CLIP zero-shot gets 71.8%. Always-"dry" gets 56.9%.
- Honest number: on the same-source subset (469 images, 41 wet), wet recall is 92.7% (CI 80.6-97.5). Those 41 wet images come from only 2 scenes.
- Kit sanity check (6 synthetic plant images, all dry): 2 false "wet" flags (gauge close-up p=0.51, thermal image p=0.63). Expect false alarms off-domain.
- Advisory only. "dry" never means safe. An operator confirms every route.

## Metrics (test set, never used for training or model selection)

95% CIs are Wilson score intervals. Threshold: p(wet) > 0.5.

**Full test set: 752 images (428 dry, 324 wet)**

| Model | Accuracy | Wet recall | Dry recall | Confusion [[dry->dry, dry->wet], [wet->dry, wet->wet]] |
|---|---|---|---|---|
| Majority class (always dry) | 56.9% (53.3-60.4) | 0.0% (0.0-1.2) | 100.0% (99.1-100.0) | [[428, 0], [324, 0]] |
| CLIP ViT-B/32 zero-shot | 71.8% (68.5-74.9) | 72.2% (67.1-76.8) | 71.5% (67.0-75.6) | [[306, 122], [90, 234]] |
| ConvNeXt-tiny fine-tuned | 99.6% (98.8-99.9) | 99.1% (97.3-99.7) | 100.0% (99.1-100.0) | [[428, 0], [3, 321]] |

**Same-source subset (Kaggle only): 469 images (428 dry, 41 wet)**. All dry images come from Kaggle and most wet images from Mendeley, so the full-set score can partly reflect the source. This subset removes that shortcut.

| Model | Accuracy | Wet recall | Dry recall | Confusion |
|---|---|---|---|---|
| Majority class | 91.3% (88.3-93.5) | 0.0% (0.0-8.6) | 100.0% (99.1-100.0) | [[428, 0], [41, 0]] |
| CLIP zero-shot | 72.9% (68.7-76.7) | 87.8% (74.5-94.7) | 71.5% (67.0-75.6) | [[306, 122], [5, 36]] |
| ConvNeXt-tiny fine-tuned | 99.4% (98.1-99.8) | 92.7% (80.6-97.5) | 100.0% (99.1-100.0) | [[428, 0], [3, 38]] |

The 3 misses are all Kaggle puddles: `gambar-1890` (p=0.004), `gambar-1892` (p=0.216), `gambar-3090` (p=0.002).
Validation (used for best-epoch pick): 99.7% accuracy, 751 images.

## Sanity check: 6 kit images (all dry)

| File | Fine-tuned p(wet) | Fine-tuned | CLIP |
|---|---|---|---|
| acoustic_valve_01.jpg | 0.237 | dry | dry |
| gauge_pressure_01.jpg | 0.507 | **wet (false alarm)** | dry |
| pipe_gallery_01.jpg | 0.152 | dry | dry |
| thermal_pump_bearing_01.jpg | 0.626 | **wet (false alarm)** | dry |
| valve_detail_01.jpg | 0.212 | dry | dry |
| visual_pump_motor_01.jpg | 0.095 | dry | dry |

## Data sources and licenses

| Source | License (checked on source page/API, 2026-10-10) | Used as | Images |
|---|---|---|---|
| Bhutad, S. and Patil, K. (2021). Dataset of Stagnant Water and Wet Surface with Annotations. Mendeley Data V4. doi:10.17632/y6zyrnxbfm.4 | CC BY 4.0 (attribution required; given in model card) | all annotated images as `wet`; "Raw data" folder skipped (unannotated duplicates) | 1,976 |
| Mahesa, M. R. Obstacles in Public Spaces for Dist-YOLO. Kaggle `muftirestumahesa/obstacles-in-public-spaces-for-dist-yolo` | CC0 1.0 | `puddle` box present = `wet` (242), else `dry` (3,113) | 3,355 |

Note: the requested Kaggle set `muftirestumahesa/image-obstacle-in-public-spaces` (CC0) downloads as 1,042 full-size JPGs with no labels. The same author's sibling set above has the 3,355 labeled images (same CC0 license), so I used it.

## Split

StratifiedGroupKFold, 7 folds, seed 0, stratified on source+label. Fold 0 = test, fold 1 = val, rest = train. Groups: 40-frame blocks for Kaggle video stills, 20-image blocks per folder for Mendeley bursts. A script assertion checks that no group crosses splits.

| Split | Kaggle dry | Kaggle wet | Mendeley wet | Total |
|---|---|---|---|---|
| train | 2,258 | 160 | 1,410 | 3,828 |
| val | 427 | 41 | 283 | 751 |
| test | 428 | 41 | 283 | 752 |

## Known limits

- Domain gap: public outdoor scenes only. No plant floors. Untested on real Spot camera frames.
- Source shortcut: most wet images come from a different dataset than the dry ones. Trust the same-source numbers more.
- Same-source wet test has only 41 images from 2 scenes. The real CI is wider than shown.
- Label noise: Kaggle images without a `puddle` box can still show wet ground.
- Block grouping is filename-based. Frames at block edges can still be near neighbors.
- False alarms on industrial close-ups and thermal images (see kit check). Use on floor/route views only.

## What failed or changed

- The pyenv Python 3.13 venv has no `_lzma`, so `torchvision` and `transformers.Trainer` crash on import. Fix: a new venv on Homebrew Python 3.14 (`ml-venv314`). Augmentation is hand-rolled with PIL (no torchvision).
- transformers 5.x removed `warmup_ratio`. `warmup_steps=0.1` now means 10% warmup.
- ONNX export worked first try (opset 17, max logit diff vs PyTorch 5e-7). An int8 version (MatMul/Gemm only) was added later; see "Quantized ONNX" below.

## Reproduce

Scripts live in the Hub repo under `training/`. Run from an empty working dir `ml/` with `src/` holding the scripts. Total time about 15 minutes on an M4 Pro (training 6.5 min).

```bash
/opt/homebrew/bin/python3.14 -m venv ml-venv314
ml-venv314/bin/pip install torch transformers accelerate scikit-learn pillow huggingface_hub onnx onnxscript onnxruntime
# data (each into its own empty dir)
mkdir -p ml/data/mendeley ml/data/kaggle2
curl -L -o mendeley.zip "https://data.mendeley.com/public-files/datasets/y6zyrnxbfm/files/b1892735-9b83-4519-9088-1c50d982b14a/file_downloaded"  # sha256 427e3368...dd39f40
unzip -q mendeley.zip -d ml/data/mendeley
kaggle datasets download muftirestumahesa/obstacles-in-public-spaces-for-dist-yolo -p dl && unzip -q dl/*.zip -d ml/data/kaggle2
cd ml
../ml-venv314/bin/python -I src/prepare.py data manifest.csv
../ml-venv314/bin/python -I src/train.py manifest.csv out
../ml-venv314/bin/python -I src/evaluate.py manifest.csv out/model "<kit>/04_ASSETS/sample_inspection_images" results.json
../ml-venv314/bin/python -I src/export_onnx.py out/model "<any image>"
hf upload builtbyd3v/spot-wetfloor-convnext-tiny out/model .
```

## Quantized ONNX

- Uploaded: `onnx/model_quantized.onnx`, 33.8 MB (fp32 is 111.4 MB). transformers.js loads it with `{ dtype: "q8" }`.
- Method: onnxruntime 1.31 `quantize_dynamic`, uint8 weights, MatMul/Gemm only. Convs stay fp32 (ops: `MatMulInteger`, `DynamicQuantizeLinear`, no `ConvInteger`).
- Gate: accuracy drop <= 1 point and same-source wet hits within 1 image of fp32. Passed.
- Rejected: all-ops QUInt8 (28.2 MB) and all-ops QInt8 per-channel (28.4 MB). Both lost 2 same-source wet images (36/41).
- Eval: onnxruntime CPU, same 752-image test split, preprocessing from `preprocessor_config.json` via `ConvNextImageProcessor`. Script: `ml/src/quantize_eval.py` (scratchpad).

| Weights | Size | Accuracy (752) | Wet recall (752) | Same-source acc (469) | Same-source wet recall (41) | Dry false alarms |
|---|---|---|---|---|---|---|
| fp32 ONNX | 111.4 MB | 99.6% | 99.1% (321/324) | 99.4% | 92.7% (38/41) | 0 |
| q8 MatMul-only (shipped) | 33.8 MB | 99.5% | 98.8% (320/324) | 99.1% | 90.2% (37/41) | 0 |
| q8 all ops (rejected) | 28.2 MB | 99.2% | 98.1% (318/324) | 98.9% | 87.8% (36/41) | 0 |

q8 flips 1 of 752 test predictions vs fp32 (one more missed same-source puddle). Max p(wet) change: 0.12.

Kit images (all dry), p(wet):

| File | fp32 | q8 | q8 call |
|---|---|---|---|
| acoustic_valve_01.jpg | 0.237 | 0.241 | dry |
| gauge_pressure_01.jpg | 0.507 | 0.505 | **wet (false alarm, same as fp32)** |
| pipe_gallery_01.jpg | 0.152 | 0.149 | dry |
| thermal_pump_bearing_01.jpg | 0.626 | 0.652 | **wet (false alarm, same as fp32)** |
| valve_detail_01.jpg | 0.212 | 0.213 | dry |
| visual_pump_motor_01.jpg | 0.095 | 0.094 | dry |
