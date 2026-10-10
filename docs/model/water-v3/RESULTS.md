# Water detector v3: results

(Draft. Results are added after training. This section was committed before any v3 calib or test number existed.)

## Rules fixed before looking at v3 results

- Same data, same splits, same test set as v2 (`pack2/labels.jsonl`, 1,351 test frames, 864 test boxes, 57 tiny).
- Same eval script logic as v2 (`evaluate.py` here is a copy: same decode, matching, metrics). Threshold: lowest cutoff with calib dry false alarms <= 5 per 100 (fp32), re-picked on calib for v3.
- Two runs train in parallel: input 800 and input 960. Pick one on CALIB only: 960 wins only if it beats 800 on calib boxes found (IoU >= 0.5) AND on calib tiny boxes found (IoU >= 0.25, n = 20). Otherwise 800 (faster in the browser). Both test results are reported anyway.
- Industrial-like test slice: `industrial_tags.json`, tagged by eye before any v3 result (rule inside the file). 284 wet frames, 504 dry frames (339 Kaggle dry, 165 SCAND indoor).
- Ship rule (q8, as shipped): tiny recall at least 2x v2 OR overall box recall up, AND false alarms per 100 on SCAND and on Kaggle dry each rise by no more than 1.0. Also qualifies: a clear gain on the industrial-like slice with no rise in false alarms there.
