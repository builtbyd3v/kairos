# Build docs/model/water-v3/industrial_tags.json from by-eye picks on the numbered contact sheets (tagsheets/index.json).
import json, sys
idx = json.load(open(sys.argv[1]))
PACK, OUT = sys.argv[2], sys.argv[3]
inc = set()
def rng(a, b): return set(range(a, b + 1))
# Kaggle scenes (one sheet frame each for dry scenes; k:13 wet frames are all paver sidewalk)
inc |= {0, 2} | rng(3, 19) | {20} | rng(21, 26)
inc |= {34, 42, 68}  # k:47 road-drive frames that show off-road concrete / gravel / pavers
inc |= {77, 82, 86, 90, 91, 96, 98, 100, 102, 103, 104, 105, 108, 111, 115}
inc |= {133, 135, 136, 137, 141, 142, 143, 144, 145, 147, 149, 153, 157, 163}
inc |= {171, 179, 180, 186, 193, 195, 198, 200, 205}
inc |= {213, 216, 218, 220, 223, 224, 225, 226, 227, 230, 232, 233, 235, 236, 239, 241, 242, 244, 246, 247, 248, 251}
inc |= {252, 254, 255, 256, 257, 258, 259, 260, 263, 264, 265, 266, 267, 272, 273, 274, 278, 280, 281, 283, 284, 285, 289, 291, 293}
inc |= rng(294, 303) | {305, 306, 307, 308, 309, 311, 312, 315, 316, 318, 319, 320, 321, 322, 323, 326, 327, 328, 330, 334}
inc |= {336, 337, 338, 339, 341, 344, 345, 346, 348, 349, 350, 352, 354, 355, 356, 357, 359, 360, 361, 362, 364, 367, 368} | rng(372, 377)
inc |= {379, 380, 381, 382, 383, 384, 385} | rng(387, 399) | rng(403, 411) | rng(413, 419)
inc |= {421, 422, 424, 425, 432, 438, 444, 450, 451, 452, 453, 454, 456, 458, 459, 460, 461}
inc |= {462, 468, 469, 470, 473, 474, 475, 477, 478, 484, 487, 488, 495, 496, 500}
inc |= {506, 507, 512, 513, 515, 516, 517, 527, 528, 529, 533, 534, 536, 538, 541, 542, 543, 544}
inc |= {546, 548, 550, 551, 552, 558, 559, 560, 561, 563, 564, 565, 567, 568, 570, 571, 573, 577, 578, 579, 580, 582, 583, 585, 586}
inc |= {590, 591, 593, 596, 601, 606, 610, 612, 613}
recs = [json.loads(l) for l in open(PACK + "/labels.jsonl")]
kag_dry_scene = {v[2]: int(k) in inc for k, v in idx.items() if v[1] == "kaggle" and not v[3]}
by_file = {v[0]: int(k) in inc for k, v in idx.items()}
tags = {}
for r in recs:
    if r["split"] != "test":
        continue
    if r["source"] == "scand":
        tags[r["file"]] = bool(r.get("indoor"))  # SCAND test indoor = polished slate (Union) and terrazzo (SAC)
    elif r["source"] == "kaggle" and not r["boxes"]:
        tags[r["file"]] = kag_dry_scene[r["scene"]]
    else:
        tags[r["file"]] = by_file[r["file"]]
json.dump({"rule": "industrial-like = the main ground surface is hard and man-made (indoor floor, tile, polished stone, concrete slab, "
                   "concrete pavers, gravel or concrete yard) and it is not a traffic road (lanes, crossings, moving traffic) and not "
                   "mud, soil or grass. Tagged by eye on numbered contact sheets BEFORE any v3 test result was seen. Kaggle dry frames "
                   "tagged per 40-frame scene from one frame; SCAND test frames by the bag's indoor flag.",
           "tags": tags}, open(OUT, "w"), indent=0)
import collections
c = collections.Counter((r["source"], bool(r["boxes"]), tags[r["file"]]) for r in recs if r["split"] == "test")
for k in sorted(c): print(k, c[k])
