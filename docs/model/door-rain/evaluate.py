"""Pick the threshold on the calibration split, then score on the held-out source (Weather-Time road images).

Scores what ships (ONNX fp32 and q8, onnxruntime CPU) against the dima806 ViT baseline and an always-"no_rain" guess.
Usage: python -I evaluate.py <manifest.csv> <model_dir> <out_json>
"""
import csv, json, math, sys
import numpy as np
import onnxruntime as ort
import torch
from PIL import Image
from sklearn.metrics import roc_auc_score
from transformers import AutoImageProcessor, AutoModelForImageClassification

manifest, model_dir, out = sys.argv[1:]
rows = list(csv.DictReader(open(manifest)))
calib = [r for r in rows if r["split"] == "calib"]
test = [r for r in rows if r["split"] == "test"]
TARGET_RECALL = 0.95  # threshold = highest one that keeps calibration rain recall >= this (favor recall)


def wilson(k, n, z=1.96):
    if n == 0:
        return None
    p, d = k / n, 1 + z * z / n
    c, h = (p + z * z / (2 * n)) / d, z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return [round(max(0.0, c - h), 4), round(min(1.0, c + h), 4)]


def score(subset, p, t):
    y = np.array([r["label"] == "rain" for r in subset])
    pred = np.array(p) >= t
    tp, fn, tn, fp = int((pred & y).sum()), int((~pred & y).sum()), int((~pred & ~y).sum()), int((pred & ~y).sum())
    n = len(y)
    return {"threshold": round(float(t), 4), "n": n, "n_rain": tp + fn, "n_no_rain": tn + fp,
            "accuracy": round((tp + tn) / n, 4), "accuracy_ci95": wilson(tp + tn, n),
            "rain_recall": round(tp / (tp + fn), 4) if tp + fn else None, "rain_recall_ci95": wilson(tp, tp + fn),
            "false_alarm_rate": round(fp / (tn + fp), 4) if tn + fp else None, "false_alarm_ci95": wilson(fp, tn + fp),
            "precision": round(tp / (tp + fp), 4) if tp + fp else None, "tp_fn_tn_fp": [tp, fn, tn, fp]}


def auroc(subset, p):  # threshold-free: 0.5 = coin flip
    return round(float(roc_auc_score([r["label"] == "rain" for r in subset], p)), 4)


def pick(subset, p):
    y = np.array([r["label"] == "rain" for r in subset])
    pr = np.sort(np.array(p)[y])  # rain probabilities, ascending
    k = int(math.floor((1 - TARGET_RECALL) * len(pr)))  # may miss at most k rain images
    return float(pr[k])


proc = AutoImageProcessor.from_pretrained(model_dir)


def onnx_probs(path, subset, bs=32):
    s = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
    o = []
    for i in range(0, len(subset), bs):
        x = proc([Image.open(r["path"]).convert("RGB") for r in subset[i:i + bs]], return_tensors="np")["pixel_values"]
        o += torch.tensor(s.run(None, {"pixel_values": x})[0]).softmax(-1)[:, 1].tolist()
    return o


dev = "mps" if torch.backends.mps.is_available() else "cpu"
BASE = "dima806/weather_types_image_detection"
bproc = AutoImageProcessor.from_pretrained(BASE)
bmodel = AutoModelForImageClassification.from_pretrained(BASE).to(dev).eval()
RAIN = bmodel.config.label2id["rain"]


@torch.no_grad()
def base_probs(subset, bs=32):
    o = []
    for i in range(0, len(subset), bs):
        x = bproc([Image.open(r["path"]).convert("RGB") for r in subset[i:i + bs]], return_tensors="pt").to(dev)
        o += bmodel(**x).logits.softmax(-1)[:, RAIN].tolist()
    return o


res = {"target_calib_rain_recall": TARGET_RECALL}
for name, path in (("fp32", f"{model_dir}/onnx/model.onnx"), ("q8", f"{model_dir}/onnx/model_quantized.onnx")):
    pc, pt = onnx_probs(path, calib), onnx_probs(path, test)
    t = pick(calib, pc)
    res[name] = {"calib": score(calib, pc, t), "test": score(test, pt, t), "test_at_0.5": score(test, pt, 0.5), "test_auroc": auroc(test, pt)}
    if name == "q8":
        res["q8_test_errors"] = [{"path": "/".join(r["path"].split("/")[-2:]), "label": r["label"], "p_rain": round(p, 3)} for r, p in zip(test, pt) if (p >= t) != (r["label"] == "rain")]

bc, bt = base_probs(calib), base_probs(test)
# note: the baseline was trained on the same Kaggle source (11 classes), so its calib numbers may include its own training images; only its test numbers are fair.
res["baseline_dima806"] = {"test_auroc": auroc(test, bt), "test_at_0.5": score(test, bt, 0.5), "test_at_own_calib_threshold": score(test, bt, pick(calib, bc))}
res["always_no_rain"] = {"test": score(test, [0.0] * len(test), 0.5)}

json.dump(res, open(out, "w"), indent=1)
for k, v in res.items():
    print(k, json.dumps(v)[:600])
assert wilson(50, 100)[0] < 0.5 < wilson(50, 100)[1]  # self-check of the CI helper
