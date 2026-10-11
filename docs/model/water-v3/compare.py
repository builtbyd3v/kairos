"""Print v2 vs v3 rows (hits/n, rate) from two evaluate.py outputs, and check the ship rule. Usage: python -I compare.py <v2.json> <v3.json>"""
import json, sys

a, b = (json.load(open(p)) for p in sys.argv[1:3])


def rows(r, key):
    t = r[key]
    h, f = t["hits"], t["frames"]
    out = {"boxes found IoU>=0.5": (h["box50"], t["n_boxes"]), "boxes found IoU>=0.25": (h["box25"], t["n_boxes"]),
           "tiny found IoU>=0.5": (h["tiny50"], t["n_tiny_boxes"]), "tiny found IoU>=0.25": (h["tiny25"], t["n_tiny_boxes"]),
           "box precision IoU>=0.5": (h["matched_dets"], t["n_detections"])}
    for g in sorted(f):
        out[f"{g} frames alarmed"] = (f[g]["alarm"], f[g]["n"])
    return out


for key in ("calib", "test_q8", "test_fp32", "test_industrial_q8", "test_industrial_fp32"):
    print(f"\n## {key}  (threshold v2 {a['threshold']}, v3 {b['threshold']})")
    ra, rb = rows(a, key), rows(b, key)
    for k in ra:
        (x, n), (y, m) = ra[k], rb[k]
        print(f"| {k} | {x}/{n} = {100 * x / max(n, 1):.1f}% | {y}/{m} = {100 * y / max(m, 1):.1f}% |")

qa, qb = rows(a, "test_q8"), rows(b, "test_q8")
p = lambda r, k: 100 * r[k][0] / max(r[k][1], 1)
tiny2x = qb["tiny found IoU>=0.5"][0] >= max(1, 2 * qa["tiny found IoU>=0.5"][0])
recall_up = qb["boxes found IoU>=0.5"][0] > qa["boxes found IoU>=0.5"][0]
fa_ok = all(p(qb, g) - p(qa, g) <= 1.0 for g in ("scand_dry frames alarmed", "kaggle_dry frames alarmed"))
print(f"\nship rule (q8): tiny 2x {tiny2x}, box recall up {recall_up}, false alarms within +1.0/100 {fa_ok} -> "
      f"{'QUALIFIES' if (tiny2x or recall_up) and fa_ok else 'does not qualify on the main rule'}")
