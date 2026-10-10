"""Merge water / wet-surface box datasets into one packed set: images resized to max side 640 + labels.jsonl.

Usage: python -I prepare.py <mendeley_dir> <kaggle_distyolo_dir> <roboflow_dir> <scand_dir|-> <out_dir>

One class: "water" (Mendeley water + wet surface, Kaggle puddle, Roboflow water / puddle / Genangan-Air).
Splits are by SOURCE and SCENE GROUP, never by image:
- test + calib: a whole source never trained on (Roboflow pwwbs water-puddle),
  plus group-held-out Kaggle blocks and whole SCAND bags. calib picks the threshold; test is touched once.
- val: group-held-out slice of the training sources, for best-epoch pick only.
"""
import collections, hashlib, json, os, re, sys
from PIL import Image

MEN, KAG, RF, SCAND, OUT = sys.argv[1:6]
MAX = 640
LIC_RF = "CC BY 4.0"
rows = []


def h(s):  # stable 0-99 bucket per group
    return int(hashlib.md5(s.encode()).hexdigest(), 16) % 100


def add(path, boxes, source, group, lic, url, split=None, **extra):
    rows.append(dict(src_path=path, boxes=boxes, source=source, scene=group, license=lic, source_url=url, split=split, **extra))


# Mendeley V4: YOLO txt next to each image, classes water / wet surface -> water. "Raw data" skipped (unannotated).
for root, _, files in os.walk(MEN):
    if "Raw data" in root:
        continue
    folder = os.path.relpath(root, MEN)
    for f in sorted(files):
        if not f.lower().endswith((".jpg", ".jpeg", ".png")):
            continue
        txt = os.path.join(root, os.path.splitext(f)[0] + ".txt")
        if not os.path.exists(txt):
            continue
        boxes = []
        for line in open(txt):
            p = line.split()
            if len(p) == 5:
                cx, cy, w, hh = map(float, p[1:])
                boxes.append(("norm", cx - w / 2, cy - hh / 2, w, hh))
        if not boxes:  # empty label file in an all-wet dataset: not a dry example
            continue
        n = int(m.group(1)) if (m := re.search(r"(\d+)", f)) else 0
        # note: phone bursts are numbered sequentially; 20-image blocks per folder approximate one scene (same as v1).
        add(os.path.join(root, f), boxes, "mendeley", f"m:{folder}:{n // 20}", "CC BY 4.0", "https://doi.org/10.17632/y6zyrnxbfm.4")

# Kaggle Dist-YOLO (CC0): "<file> x1,y1,x2,y2,cls,dist ..." ; class 2 = puddle. No puddle box = dry negative.
for line in open(os.path.join(KAG, "_annotations.txt")):
    p = line.split()
    if not p:
        continue
    boxes = []
    for b in p[1:]:
        v = b.split(",")
        if int(v[4]) == 2:
            x1, y1, x2, y2 = map(float, v[:4])
            boxes.append(("px", x1, y1, x2 - x1, y2 - y1))
    n = int(re.match(r"gambar-(\d+)-", p[0]).group(1))
    # note: video stills; 40-frame blocks approximate one scene (same as v1). Unboxed frames can still show wet ground (label noise).
    add(os.path.join(KAG, p[0]), boxes, "kaggle", f"k:{n // 40}", "CC0 1.0",
        "https://www.kaggle.com/datasets/muftirestumahesa/obstacles-in-public-spaces-for-dist-yolo")

# Roboflow COCO exports. Only water-like classes; images without a water box are dropped (other classes are not water labels).
WATER = {"water", "puddle", "Puddle", "Genangan-Air"}
HELD_OUT = {"projects-pwwbs__water-puddle-joyj6"}  # note: torp water-spill (110 imgs, 11 labels) dropped, too few labels
for d in sorted(os.listdir(RF)):
    base = os.path.join(RF, d)
    if not os.path.isdir(base):
        continue
    ws, proj, ver = d.split("__")
    seen = set()
    for sp in ("train", "valid", "test"):
        f = os.path.join(base, sp, "_annotations.coco.json")
        if not os.path.exists(f):
            continue
        j = json.load(open(f))
        cats = {c["id"]: c["name"] for c in j["categories"]}
        anns = collections.defaultdict(list)
        for a in j["annotations"]:
            if cats[a["category_id"]] in WATER:
                anns[a["image_id"]].append(("px", *a["bbox"]))
        for im in j["images"]:
            if not anns[im["id"]]:
                continue
            stem = re.split(r"_(?:jpg|jpeg|png|bmp)\.rf\.", im["file_name"])[0]
            stem = re.sub(r"_flipped_\w+|_png|_jpg|_bmp", "", stem)
            if f"{ws}__{proj}" in HELD_OUT:
                if stem in seen:  # note: held-out sets keep one copy per original image (Roboflow augments duplicate stems)
                    continue
                seen.add(stem)
            # note: frame numbers in 20-blocks approximate a scene; web-scraped stems mostly form their own group.
            group = re.sub(r"\d+", lambda m: str(int(m.group()) // 20), stem)
            add(os.path.join(base, sp, im["file_name"]), anns[im["id"]], f"rf:{ws}/{proj}", f"r:{proj}:{group}", LIC_RF,
                f"https://universe.roboflow.com/{ws}/{proj}/dataset/{ver}")

# SCAND (CC0) Spot frames: dry negatives, whole bags per split.
if SCAND != "-" and os.path.exists(os.path.join(SCAND, "labels.jsonl")):
    recs = [json.loads(l) for l in open(os.path.join(SCAND, "labels.jsonl"))]
    recs = [r for r in recs if not r.get("note")]  # note: frames flagged as showing water are excluded, not used as dry
    bags = sorted({r["scene"] for r in recs})
    # note: 1 bag calib, ~half the rest test, remainder train (negatives). Fixed by sorted bag name.
    role = {b: ("calib" if i == 0 else "test" if i % 2 == 1 else "train") for i, b in enumerate(bags)}
    for r in recs:
        add(os.path.join(SCAND, r["file"]), [], "scand", f"s:{r['scene']}", "CC0 1.0", "https://doi.org/10.18738/T8/0PRYRH",
            split=role[r["scene"]], indoor=r.get("indoor"))

# Split by group.
for r in rows:
    if r["split"]:
        continue
    b = h(r["scene"])
    if r["source"] == "rf:projects-pwwbs/water-puddle-joyj6":
        r["split"] = "calib" if b < 35 else "test"
    elif r["source"] == "kaggle":
        r["split"] = "test" if b < 20 else "calib" if b < 30 else "val" if b < 37 else "train"
    else:
        r["split"] = "val" if b < 8 else "train"

# Leakage check: no scene group crosses splits.
g2s = collections.defaultdict(set)
for r in rows:
    g2s[r["scene"]].add(r["split"])
assert all(len(s) == 1 for s in g2s.values()), "group crosses splits"

# Pack: resize to max side 640, boxes to normalized xywh, drop degenerate boxes.
os.makedirs(os.path.join(OUT, "images"), exist_ok=True)
out = open(os.path.join(OUT, "labels.jsonl"), "w")
stats = collections.Counter()
for i, r in enumerate(rows):
    im = Image.open(r["src_path"]).convert("RGB")
    W, H = im.size
    boxes = []
    for kind, x, y, w, hh in r["boxes"]:
        if kind == "px":
            x, y, w, hh = x / W, y / H, w / W, hh / H
        x, y = max(0.0, x), max(0.0, y)
        w, hh = min(w, 1 - x), min(hh, 1 - y)
        if w > 0.002 and hh > 0.002:
            boxes.append([round(x, 5), round(y, 5), round(w, 5), round(hh, 5)])
    if r["boxes"] and not boxes:  # note: labeled wet but every box degenerate; skip rather than call it dry
        continue
    s = MAX / max(W, H)
    if s < 1:
        im = im.resize((round(W * s), round(H * s)), Image.BILINEAR)
    name = f"images/{i:06d}.jpg"
    im.save(os.path.join(OUT, name), quality=90)
    rec = {k: v for k, v in r.items() if k not in ("src_path", "boxes")}
    rec.update(file=name, w=im.size[0], h=im.size[1], boxes=boxes, orig_name=os.path.basename(r["src_path"]))
    out.write(json.dumps(rec) + "\n")
    stats[(r["split"], r["source"], "wet" if boxes else "dry")] += 1
    stats[(r["split"], "tiny_boxes")] += sum(1 for b in boxes if b[2] * b[3] < 0.01)
    stats[(r["split"], "boxes")] += len(boxes)
for k in sorted(stats):
    print(*k, stats[k])
