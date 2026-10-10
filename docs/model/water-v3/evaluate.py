"""Evaluate a water detector (v2 or v3) on the calib and test splits. Copy of docs/model/water-v2/evaluate.py:
same decode, threshold rule, matching and metrics. Changes: the v1 classifier baseline is dropped, and every test
metric is also reported on the INDUSTRIAL-LIKE slice (industrial_tags.json, tagged by eye before any v3 test result).

Usage: python -I evaluate.py <pack_dir> <model_dir> <industrial_tags.json> <out.json> [quant_ops]
quant_ops: "all" (default, ConvInteger + MatMulInteger) or "matmul" (MatMul/Gemm only, convs fp32).
The model dir needs onnx/model.onnx (fp32) and the preprocessor config (its size is the input size).

Rules fixed before looking at test:
- Detections: sigmoid score per query, greedy NMS at IoU 0.5 (same as lib/water-model.ts decode()).
- Threshold: lowest score cutoff whose CALIB dry-frame false alarm rate is <= 5 per 100 frames (SCAND + Kaggle dry pooled).
- A water box is found if an unmatched detection overlaps it at IoU >= 0.5 (also reported at IoU >= 0.25: puddle edges are vague).
- Tiny = box area < 1% of the frame. Frame alarm = any detection at or above the threshold.
"""
import collections, json, os, sys
import numpy as np
import onnxruntime as ort
from PIL import Image
from transformers import AutoImageProcessor

PACK, V2, TAGS, OUT = sys.argv[1:5]
QOPS = sys.argv[5] if len(sys.argv) > 5 else "all"
IND = json.load(open(TAGS))["tags"]
TILES = os.environ.get("TILES") == "1"  # also score a tiled q8 variant (5 passes per frame)
recs = [json.loads(l) for l in open(os.path.join(PACK, "labels.jsonl"))]
recs = [r for r in recs if r["split"] in ("calib", "test")]
recs = recs[:: int(os.environ.get("EVAL_STRIDE", "1"))]  # note: stride > 1 only for smoke runs of this script

q8_path = os.path.join(V2, "onnx", "model_quantized.onnx")
if not os.path.exists(q8_path):
    from onnxruntime.quantization import quantize_dynamic, QuantType
    ops = ["MatMul", "Gemm"] if QOPS == "matmul" else None
    quantize_dynamic(os.path.join(V2, "onnx", "model.onnx"), q8_path, weight_type=QuantType.QUInt8, op_types_to_quantize=ops)

proc = AutoImageProcessor.from_pretrained(V2)
sess = {k: ort.InferenceSession(os.path.join(V2, "onnx", f), providers=["CPUExecutionProvider"])
        for k, f in (("fp32", "model.onnx"), ("q8", "model_quantized.onnx"))}


def iou(a, b):
    ix = max(0, min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0]))
    iy = max(0, min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1]))
    inter = ix * iy
    return inter / (a[2] * a[3] + b[2] * b[3] - inter + 1e-9)


def decode(logits, boxes, floor=0.05, top=100):
    """Sigmoid, keep >= floor (top 100 by score), greedy NMS at IoU 0.5. Returns [([x, y, w, h], score)]."""
    s = 1 / (1 + np.exp(-logits[:, 0]))
    idx = [q for q in np.argsort(-s)[:top] if s[q] >= floor]
    cx, cy, w, h = boxes[idx].T
    x1, y1 = np.clip(cx - w / 2, 0, 1), np.clip(cy - h / 2, 0, 1)
    x2, y2 = np.clip(cx + w / 2, 0, 1), np.clip(cy + h / 2, 0, 1)
    area = (x2 - x1) * (y2 - y1)
    alive = np.ones(len(idx), bool)
    dets = []
    for i in range(len(idx)):
        if not alive[i]:
            continue
        dets.append(([float(x1[i]), float(y1[i]), float(x2[i] - x1[i]), float(y2[i] - y1[i])], float(s[idx[i]])))
        inter = np.clip(np.minimum(x2[i], x2) - np.maximum(x1[i], x1), 0, None) * np.clip(np.minimum(y2[i], y2) - np.maximum(y1[i], y1), 0, None)
        alive &= inter / (area[i] + area - inter + 1e-9) < 0.5
    return dets


rows = []
for i, r in enumerate(recs):
    im = Image.open(os.path.join(PACK, r["file"])).convert("RGB")
    px = proc(im, return_tensors="np")["pixel_values"].astype(np.float32)
    row = {"r": r}
    for k, s in sess.items():
        lg, bx = s.run(["logits", "pred_boxes"], {"pixel_values": px})
        row[k] = decode(lg[0], bx[0])
    if TILES:  # full frame + 4 overlapping 60% tiles (each upscaled to 640), merged by the same NMS
        W, H = im.size
        dets = list(row["q8"])
        for ox, oy in ((0, 0), (0.4, 0), (0, 0.4), (0.4, 0.4)):
            crop = im.crop((int(ox * W), int(oy * H), int((ox + 0.6) * W), int((oy + 0.6) * H)))
            lg, bx = sess["q8"].run(["logits", "pred_boxes"], {"pixel_values": proc(crop, return_tensors="np")["pixel_values"].astype(np.float32)})
            dets += [([ox + b[0] * 0.6, oy + b[1] * 0.6, b[2] * 0.6, b[3] * 0.6], sc) for b, sc in decode(lg[0], bx[0])]
        dets.sort(key=lambda d: -d[1])
        row["tiled_q8"] = []
        for d in dets:
            if all(iou(k[0], d[0]) < 0.5 for k in row["tiled_q8"]):
                row["tiled_q8"].append(d)
    rows.append(row)
    if i % 100 == 0:
        print(i, len(recs), flush=True)


def group(r):
    if r["source"] == "scand":
        return "scand_dry"
    if r["source"] == "kaggle":
        return "kaggle_wet" if r["boxes"] else "kaggle_dry"
    return "pwwbs_wet"


def score(split, key, thr, industrial=False):
    sub = [x for x in rows if x["r"]["split"] == split and (not industrial or IND[x["r"]["file"]])]
    frames = collections.defaultdict(lambda: [0, 0])  # group -> [alarm frames, n]
    tp = {0.5: 0, 0.25: 0}; tiny_tp = {0.5: 0, 0.25: 0}; n_gt = n_tiny = n_pred = matched = 0
    for x in sub:
        dets = [d for d in x[key] if d[1] >= thr]
        n_pred += len(dets)
        g = group(x["r"])
        frames[g][0] += bool(dets); frames[g][1] += 1
        gts = x["r"]["boxes"]
        n_gt += len(gts); n_tiny += sum(b[2] * b[3] < 0.01 for b in gts)
        for t in (0.5, 0.25):
            used = set()
            for gt in gts:
                best = max(((iou(d[0], gt), j) for j, d in enumerate(dets) if j not in used), default=(0, -1))
                if best[0] >= t:
                    used.add(best[1]); tp[t] += 1; tiny_tp[t] += gt[2] * gt[3] < 0.01
            if t == 0.5:
                matched += len(used)
    return {
        "threshold": thr, "n_frames": len(sub), "n_boxes": n_gt, "n_tiny_boxes": n_tiny, "n_detections": n_pred,
        "box_recall_iou50": tp[0.5] / max(n_gt, 1), "box_recall_iou25": tp[0.25] / max(n_gt, 1),
        "tiny_recall_iou50": tiny_tp[0.5] / max(n_tiny, 1), "tiny_recall_iou25": tiny_tp[0.25] / max(n_tiny, 1),
        "box_precision_iou50": matched / max(n_pred, 1),
        "hits": {"box50": tp[0.5], "box25": tp[0.25], "tiny50": tiny_tp[0.5], "tiny25": tiny_tp[0.25], "matched_dets": matched},
        "frames": {g: {"alarm": a, "n": n, "per100": round(100 * a / n, 1)} for g, (a, n) in sorted(frames.items())},
    }


# Threshold from calib only (fp32 detections; q8 uses the same cutoff, as shipped).
dry = [x for x in rows if x["r"]["split"] == "calib" and not x["r"]["boxes"]]


def calibrate(key):
    for t in np.arange(0.05, 0.96, 0.01):
        if sum(any(d[1] >= t for d in x[key]) for x in dry) / len(dry) <= 0.05:
            return round(float(t), 2)
    return 0.95


thr = calibrate("fp32")

res = {"threshold_rule": "lowest cutoff with calib dry false alarms <= 5 per 100 frames", "threshold": thr,
       "quant_ops": QOPS, "calib": score("calib", "fp32", thr), "test_fp32": score("test", "fp32", thr), "test_q8": score("test", "q8", thr),
       "test_industrial_fp32": score("test", "fp32", thr, True), "test_industrial_q8": score("test", "q8", thr, True),
       "input_size": dict(proc.size)}

if TILES:
    tthr = calibrate("tiled_q8")
    res["tiled_q8"] = {"threshold": tthr, "calib": score("calib", "tiled_q8", tthr), "test": score("test", "tiled_q8", tthr)}

# q8 vs fp32 parity on test: frames whose alarm flips, max score gap of the top detection.
test = [x for x in rows if x["r"]["split"] == "test"]
top = lambda ds: ds[0][1] if ds else 0.0
res["q8_parity"] = {"alarm_flips": sum((top(x["fp32"]) >= thr) != (top(x["q8"]) >= thr) for x in test), "n": len(test),
                    "max_top_score_gap": round(max(abs(top(x["fp32"]) - top(x["q8"])) for x in test), 4)}

# Per-frame dump for error review.
res["test_frames"] = [{"file": x["r"]["file"], "orig": x["r"]["orig_name"], "group": group(x["r"]), "n_gt": len(x["r"]["boxes"]),
                       "industrial": IND[x["r"]["file"]], "top_fp32": round(top(x["fp32"]), 3), "top_q8": round(top(x["q8"]), 3)} for x in test]
json.dump(res, open(OUT, "w"), indent=1)
print(json.dumps({k: v for k, v in res.items() if k != "test_frames"}, indent=1))
