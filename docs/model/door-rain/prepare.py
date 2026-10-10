"""Build manifest.csv: path,label,source,split. Labels: rain / no_rain.

Train/val/calib: Kaggle jehanbhathena/weather-dataset (CC0), extracted to <data_dir>/wir/dataset/<class>/,
plus Kaggle pratik2901/multiclass-weather-dataset (CC BY 4.0, Ajayi 2018) in <data_dir>/mwd/ for ordinary clear/cloudy scenes,
which WIR lacks (v1 without it scored near chance on the held-out source).
Test (held-out source, never seen in training or threshold pick): Kaggle wjybuqi/weathertime-classification-with-road-images (CC0),
extracted to <data_dir>/wt/. Only its train_dataset has labels (2,600); its test_dataset is unlabeled, so it is not used.
Usage: python -I prepare.py <data_dir> <out_csv>
"""
import csv, json, os, sys
from collections import Counter
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

# 70 / 15 / 15, stratified on the original class. note: scraped photos have no scene ids, so near-duplicates may cross splits.
strata = [r[2] for r in wir]
tr, rest = train_test_split(wir, test_size=0.3, stratify=strata, random_state=0)
va, ca = train_test_split(rest, test_size=0.5, stratify=[r[2] for r in rest], random_state=0)

wt = []
for a in json.load(open(os.path.join(data, "wt", "train_dataset", "train.json")))["annotations"]:
    p = os.path.join(data, "wt", "train_dataset", a["filename"].replace("\\", "/"))
    if os.path.isfile(p) and ok(p):
        wt.append([p, "rain" if a["weather"] == "Rainy" else "no_rain", f"wt_{a['weather'].lower()}"])

with open(out, "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["path", "label", "source", "split"])
    for split, rows in (("train", tr), ("val", va), ("calib", ca), ("test", wt)):
        for r in rows:
            w.writerow(r + [split])

print(Counter((s, r[1]) for s, rows in (("train", tr), ("val", va), ("calib", ca), ("test", wt)) for r in rows))
