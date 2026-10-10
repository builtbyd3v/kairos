"""Score bands -> share of boxes that are real water. Bands are fit on CALIB, checked on TEST.

Usage: python -I confidence.py <pack_dir> <model_dir> <fp32.onnx> <q8.onnx> <dets.json>
Writes per-frame detections (score >= 0.3, both dtypes) to dets.json (reused if it exists), prints the band tables.
Rules: threshold 0.49 (shipped). A detection is real water if it overlaps an unused truth box at IoU >= 0.25,
greedy by score. Bands with n < 20 merge into their neighbor. 95% CIs are Wilson.
"""
import json, math, os, sys
import numpy as np

PACK, MODEL, FP32, Q8, OUT = sys.argv[1:6]
THR, BANDS = 0.49, [0.49, 0.55, 0.65, 0.75, 1.0001]
iou = lambda a, b: (lambda ix, iy: ix * iy / (a[2] * a[3] + b[2] * b[3] - ix * iy + 1e-9))(
    max(0, min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0])), max(0, min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1])))


def decode(logits, boxes, floor=0.3):
    """Same as evaluate.py decode(): sigmoid, keep >= floor, greedy NMS at IoU 0.5."""
    s = 1 / (1 + np.exp(-logits[:, 0]))
    dets = []
    for q in np.argsort(-s)[:100]:
        if s[q] < floor:
            break
        cx, cy, w, h = boxes[q]
        x1, y1, x2, y2 = (float(np.clip(v, 0, 1)) for v in (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2))
        b = [x1, y1, x2 - x1, y2 - y1]
        if all(iou(b, d[0]) < 0.5 for d in dets):
            dets.append((b, float(s[q])))
    return dets


if not os.path.exists(OUT):
    import onnxruntime as ort
    from PIL import Image
    from transformers import AutoImageProcessor
    proc = AutoImageProcessor.from_pretrained(MODEL)
    sess = {k: ort.InferenceSession(p, providers=["CPUExecutionProvider"]) for k, p in (("fp32", FP32), ("q8", Q8))}
    rows = []
    recs = [json.loads(l) for l in open(os.path.join(PACK, "labels.jsonl"))]
    for i, r in enumerate(x for x in recs if x["split"] in ("calib", "test")):
        px = proc(Image.open(os.path.join(PACK, r["file"])).convert("RGB"), return_tensors="np")["pixel_values"].astype(np.float32)
        row = {k: r[k] for k in ("file", "split", "source", "boxes", "orig_name", "scene", "w", "h")}
        for k, s in sess.items():
            lg, bx = s.run(["logits", "pred_boxes"], {"pixel_values": px})
            row[k] = decode(lg[0], bx[0])
        rows.append(row)
        if i % 200 == 0:
            print(i, flush=True)
    json.dump(rows, open(OUT, "w"))
rows = json.load(open(OUT))


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    c = (p + z * z / (2 * n)) / (1 + z * z / n)
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return (c - h, c + h)


def labeled(split, key):
    """[(score, is_water)] for every detection >= THR in the split."""
    out = []
    for r in (x for x in rows if x["split"] == split):
        used = set()
        for b, s in sorted((d for d in r[key] if d[1] >= THR), key=lambda d: -d[1]):
            best = max(((iou(b, g), j) for j, g in enumerate(r["boxes"]) if j not in used), default=(0, -1))
            hit = best[0] >= 0.25
            if hit:
                used.add(best[1])
            out.append((s, hit))
    return out


def table(dets, edges):
    res = []
    for lo, hi in zip(edges, edges[1:]):
        b = [h for s, h in dets if lo <= s < hi]
        res.append({"lo": lo, "hi": min(hi, 1.0), "n": len(b), "water": sum(b),
                    "pct": round(100 * sum(b) / max(len(b), 1), 1), "ci": [round(100 * v, 1) for v in wilson(sum(b), len(b))]})
    return res


# Fit bands on calib: merge any band with n < 20 into its upper neighbor (last band merges down).
calib = labeled("calib", "fp32")
edges = list(BANDS)
while True:
    t = table(calib, edges)
    small = [i for i, b in enumerate(t) if b["n"] < 20]
    if not small:
        break
    i = small[0]
    edges.pop(i + 1 if i + 1 < len(t) else i)
out = {"edges": edges, "calib_fp32": t, "test_fp32": table(labeled("test", "fp32"), edges), "test_q8": table(labeled("test", "q8"), edges)}
print(json.dumps(out, indent=1))
