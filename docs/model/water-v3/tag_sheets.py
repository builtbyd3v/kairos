# Numbered contact sheets of test frames for by-eye industrial-like tagging. Writes index.json (number -> file).
import json, os, sys
from PIL import Image, ImageDraw
PACK, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
recs = [json.loads(l) for l in open(os.path.join(PACK, "labels.jsonl"))]
test = [r for r in recs if r["split"] == "test" and r["source"] != "scand"]
# Kaggle dry: one frame per scene (frames in a 40-block are one video scene)
seen, items = set(), []
for r in test:
    if r["source"] == "kaggle" and not r["boxes"]:
        if r["scene"] in seen:
            continue
        seen.add(r["scene"])
    items.append(r)
json.dump({i: [r["file"], r["source"], r["scene"], bool(r["boxes"])] for i, r in enumerate(items)}, open(os.path.join(OUT, "index.json"), "w"))
C, R, T = 7, 6, 220
for s in range(0, len(items), C * R):
    sh = Image.new("RGB", (C * T, R * T))
    d = ImageDraw.Draw(sh)
    for k, r in enumerate(items[s:s + C * R]):
        im = Image.open(os.path.join(PACK, r["file"])).convert("RGB")
        im.thumbnail((T - 4, T - 4))
        x, y = (k % C) * T, (k // C) * T
        sh.paste(im, (x + 2, y + 2))
        d.rectangle((x + 2, y + 2, x + 40, y + 18), fill=(0, 0, 0))
        d.text((x + 4, y + 4), str(s + k), fill=(255, 255, 0))
    sh.save(os.path.join(OUT, f"sheet_{s // (C * R):02d}.jpg"), quality=80)
print(len(items), "items")
