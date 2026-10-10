"""Build manifest.csv: path,label,source,split. Labels: rain / no_rain.

Train/val/calib: Kaggle jehanbhathena/weather-dataset (CC0), extracted to <data_dir>/wir/dataset/<class>/,
plus Kaggle pratik2901/multiclass-weather-dataset (CC BY 4.0, Ajayi 2018) in <data_dir>/mwd/ for ordinary clear/cloudy scenes,
which WIR lacks (v1 without it scored near chance on the held-out source).
Test: Kaggle wjybuqi/weathertime-classification-with-road-images (CC0), extracted to <data_dir>/wt/. Never trained on and never used
for the threshold, but EXPLORATORY: v1's score on it is why v2 added MWD, so it is not a clean held-out set. Only its train_dataset
has labels (2,600); its test_dataset is unlabeled, so it is not used. Its source column keeps the period: wt_<period>_<weather>.
Usage: python -I prepare.py <data_dir> <out_csv>
"""
import csv, hashlib, json, os, sys
from collections import Counter, defaultdict
import numpy as np
from PIL import Image
from sklearn.model_selection import train_test_split

data, out = sys.argv[1:]
RAIN = {"rain"}
# note: hail and lightning skipped as ambiguous (hail is precipitation; lightning shots often show rain). Everything else = no_rain.
SKIP = {"hail", "lightning"}


def ok(p):
    # untrusted files: must decode as a real image
    try:
        with Image.open(p) as im:
            im.verify()
        return True
    except Exception:
        return False


wir = []
root = os.path.join(data, "wir", "dataset")
for c in sorted(os.listdir(root)):
    if c in SKIP or not os.path.isdir(os.path.join(root, c)):
        continue
    for f in sorted(os.listdir(os.path.join(root, c))):
        p = os.path.join(root, c, f)
        if ok(p):
            wir.append([p, "rain" if c in RAIN else "no_rain", f"wir_{c}"])

mroot = os.path.join(data, "mwd", "Multi-class Weather Dataset")
for c in sorted(os.listdir(mroot)):
    for f in sorted(os.listdir(os.path.join(mroot, c))):
        p = os.path.join(mroot, c, f)
        if ok(p):
            wir.append([p, "rain" if c == "Rain" else "no_rain", f"mwd_{c.lower()}"])


def sha(p):
    with open(p, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def ahash(p):
    # 8x8 average hash. Byte-identical files always share it, so it is the one group key for exact and near duplicates.
    # note: exact hash match only (Hamming 0); a Hamming radius would catch more re-crops but needs a pairwise scan.
    with Image.open(p) as im:
        a = np.asarray(im.convert("L").resize((8, 8), Image.Resampling.BILINEAR), dtype=np.float32)
    return np.packbits(a > a.mean()).tobytes().hex()


# Group duplicates BEFORE the split so each group lands in one split.
groups = defaultdict(list)
for r in wir:
    groups[ahash(r[0])].append(r)
shas = Counter(sha(r[0]) for r in wir)
multi = [g for g in groups.values() if len(g) > 1]
mixed = [g for g in multi if len({r[1] for r in g}) > 1]
print(f"pool {len(wir)} images; {sum(1 for c in shas.values() if c > 1)} SHA-256 groups (>1 file); {len(multi)} aHash groups "
      f"(>1 file, {sum(len(g) for g in multi)} files, largest {max(map(len, multi), default=0)}); "
      f"{len(mixed)} groups ({sum(len(g) for g in mixed)} files) mix rain and no_rain")
# note: 8x8 aHash over-merges look-alike scenes (largest group 82). That is safe for leakage, so mixed groups are kept, not dropped.
keep = list(groups.values())

# 70 / 15 / 15 over groups, stratified on the first member's source class (almost all groups are one image).
tr, rest = train_test_split(keep, test_size=0.3, stratify=[g[0][2] for g in keep], random_state=0)
va, ca = train_test_split(rest, test_size=0.5, stratify=[g[0][2] for g in rest], random_state=0)
tr, va, ca = ([r for g in gs for r in g] for gs in (tr, va, ca))
spl = {r[0]: s for s, rows in (("train", tr), ("val", va), ("calib", ca)) for r in rows}
assert all(len({spl[r[0]] for r in g}) == 1 for g in keep)  # self-check: no group crosses splits

wt = []
for a in json.load(open(os.path.join(data, "wt", "train_dataset", "train.json")))["annotations"]:
    p = os.path.join(data, "wt", "train_dataset", a["filename"].replace("\\", "/"))
    if os.path.isfile(p) and ok(p):
        wt.append([p, "rain" if a["weather"] == "Rainy" else "no_rain", f"wt_{a['period'].lower()}_{a['weather'].lower()}"])
print("test images whose aHash matches a training-pool image:", sum(ahash(r[0]) in groups for r in wt))

with open(out, "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["path", "label", "source", "split"])
    for split, rows in (("train", tr), ("val", va), ("calib", ca), ("test", wt)):
        for r in rows:
            w.writerow(r + [split])

print(Counter((s, r[1]) for s, rows in (("train", tr), ("val", va), ("calib", ca), ("test", wt)) for r in rows))
