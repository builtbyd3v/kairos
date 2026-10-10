"""Copy the hand-picked demo frames (TEST split only, checked by eye), write the capture JSONs, re-score the saved files.

Usage: python -I demo_frames.py <pack_dir> <scand_dir> <model_dir> <fp32.onnx> <q8.onnx> <repo_root> <sheet.jpg>
Picks are pack labels.jsonl file names (pack/images/NNNNNN.jpg). SCAND frames use the 1280x720 originals from <scand_dir>.
Scores are measured on the saved JPEGs, the same bytes the browser loads.
"""
import json, os, sys
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw
from transformers import AutoImageProcessor

PACK, SCAND, MODEL, FP32, Q8, ROOT, SHEET = sys.argv[1:8]
THR = 0.49
WET = ["003856", "003843", "003857", "003836", "003847", "003846"]  # Kaggle k:47 road-shoulder walk, smallest puddle first
DRY = ["010402", "010575", "002491", "002509"]  # SCAND Union + SAC (outdoor), Kaggle dry brick walkways
DOOR = {"door-wet": "003839", "door-dry2": "010575"}
URL = {"kaggle": "https://www.kaggle.com/datasets/muftirestumahesa/obstacles-in-public-spaces-for-dist-yolo"}

recs = {os.path.basename(r["file"])[:-4]: r for r in map(json.loads, open(os.path.join(PACK, "labels.jsonl")))}
proc = AutoImageProcessor.from_pretrained(MODEL)
sess = {k: ort.InferenceSession(p, providers=["CPUExecutionProvider"]) for k, p in (("fp32", FP32), ("q8", Q8))}


def score(im):
    """Top sigmoid score and boxes >= THR (fp32), same decode as lib/water-model.ts."""
    px = proc(im, return_tensors="np")["pixel_values"].astype(np.float32)
    out = {}
    for k, s in sess.items():
        lg, bx = s.run(["logits", "pred_boxes"], {"pixel_values": px})
        sc = 1 / (1 + np.exp(-lg[0][:, 0]))
        out[k] = (float(sc.max()), [(bx[0][q].tolist(), float(sc[q])) for q in np.argsort(-sc) if sc[q] >= THR])
    return out


def save(key, dest):
    r = recs[key]
    assert r["split"] == "test", (key, r["split"])
    src = os.path.join(SCAND, "images", r["orig_name"]) if r["source"] == "scand" else os.path.join(PACK, r["file"])
    im = Image.open(src).convert("RGB")
    im.thumbnail((960, 960), Image.LANCZOS)  # long side <= 960, never upscales
    im.save(dest, quality=90)
    im = Image.open(dest).convert("RGB")
    return r, im, score(im)


rows, sheet = [], []
for group, keys in (("wet", WET), ("dry", DRY)):
    frames = []
    for n, key in enumerate(keys):
        name = f"demo-{group}-{n}.jpg"
        r, im, sc = save(key, os.path.join(ROOT, "public/captures", name))
        frames.append({"src": f"/captures/{name}", "truth": r["boxes"], "source": r["source"], "license": r["license"],
                       "url": URL.get(r["source"], r["source_url"]), "orig": r["orig_name"], "split": r["split"]})
        rows.append((name, r, im, sc)); sheet.append((name, im, r, sc))
    note = ("Held-out test split of the water model (never trained on). Road-shoulder puddles, smallest first. Boxes are ground truth [x,y,w,h], normalized."
            if group == "wet" else "Held-out test split (never trained on). Obviously dry floors and walkways; SCAND is a camera on a real Spot robot. No water in these frames.")
    json.dump({"note": note, "frames": frames}, open(os.path.join(ROOT, f"public/captures/demo-{group}.json"), "w"), indent=1)
for name, key in DOOR.items():
    r, im, sc = save(key, os.path.join(ROOT, "public/door", name + ".jpg"))
    rows.append((name + ".jpg", r, im, sc)); sheet.append((name, im, r, sc))

print("| Frame | Source | Orig | Size | Test split | Top fp32 | Top int8 | Boxes >= 0.49 (fp32/int8) | Smallest truth box |")
print("|---|---|---|---|---|---|---|---|---|")
for name, r, im, sc in rows:
    small = min((b[2] * b[3] for b in r["boxes"]), default=0)
    print(f"| {name} | {r['source']} ({r['license']}) | {r['orig_name'][:40]} | {im.size[0]}x{im.size[1]} | {r['split'] == 'test'} | "
          f"{sc['fp32'][0]:.3f} | {sc['q8'][0]:.3f} | {len(sc['fp32'][1])}/{len(sc['q8'][1])} | {100 * small:.1f}% |")

# Contact sheet: truth in green, fp32 boxes in red.
TW, TH = 480, 300
cs = Image.new("RGB", (4 * TW, ((len(sheet) + 3) // 4) * (TH + 18)), "white")
for k, (name, im, r, sc) in enumerate(sheet):
    t = im.copy(); t.thumbnail((TW, TH)); d = ImageDraw.Draw(t); W, H = t.size
    for x, y, w, h in r["boxes"]:
        d.rectangle([x * W, y * H, (x + w) * W, (y + h) * H], outline="lime", width=2)
    for (cx, cy, w, h), s in sc["fp32"][1]:
        d.rectangle([(cx - w / 2) * W, (cy - h / 2) * H, (cx + w / 2) * W, (cy + h / 2) * H], outline="red", width=3)
    x0, y0 = (k % 4) * TW, (k // 4) * (TH + 18)
    cs.paste(t, (x0, y0))
    ImageDraw.Draw(cs).text((x0 + 4, y0 + TH + 3), f"{name}  fp32 {sc['fp32'][0]:.2f}  int8 {sc['q8'][0]:.2f}", fill="black")
cs.save(SHEET, quality=85)
