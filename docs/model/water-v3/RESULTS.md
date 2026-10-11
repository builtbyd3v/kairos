# Water detector v3: results

(Draft. Results are added after training. This section was committed before any v3 calib or test number existed.)

## Rules fixed before looking at v3 results

- Same data, same splits, same test set as v2 (`pack2/labels.jsonl`, 1,351 test frames, 864 test boxes, 57 tiny).
- Same eval script logic as v2 (`evaluate.py` here is a copy: same decode, matching, metrics). Threshold: lowest cutoff with calib dry false alarms <= 5 per 100 (fp32), re-picked on calib for v3.
- Two runs train in parallel: input 800 and input 960. Pick one on CALIB only: 960 wins only if it beats 800 on calib boxes found (IoU >= 0.5) AND on calib tiny boxes found (IoU >= 0.25, n = 20). Otherwise 800 (faster in the browser). Both test results are reported anyway.
- Added 19:40, after seeing ONLY run A 800's calib numbers (no test number seen): run A 800 calib was much worse than v2 (threshold rose to 0.66; boxes found 82/394 vs v2 197/394). Its top calib false alarms were tiny boxes on tiles and logos, which matches the pasted crops. So run B = same recipe with PASTE=0 (no copy-paste), at 800 (L4) and 960 (A100). Final pick across all four runs, CALIB only: the run with the most calib boxes found at IoU >= 0.5; a 960 run is picked over the best 800 run only if it also has at least as many calib tiny hits at IoU >= 0.25.
- Added 20:05, before any run B number: the run B 800 weights are also exported and scored at 640 input (trained multi-scale 640-832, so 640 is in range; same browser cost as v2). It joins the same calib-only pick, as an 800-class candidate.
- Industrial-like test slice: `industrial_tags.json`, tagged by eye before any v3 result (rule inside the file). 284 wet frames, 504 dry frames (339 Kaggle dry, 165 SCAND indoor).
- Ship rule (q8, as shipped): tiny recall at least 2x v2 OR overall box recall up, AND false alarms per 100 on SCAND and on Kaggle dry each rise by no more than 1.0. Also qualifies: a clear gain on the industrial-like slice with no rise in false alarms there.
