# NextEra SPOT kit: findings

## TL;DR
- NextEra's written brief is about **data insight**, not weather: turn synthetic Spot mission data into something an operator can understand and act on. Raw tables score low.
- The kit facility is a **2-floor indoor plant** (15 waypoints). There are **no weather fields** anywhere in the data.
- The data hides real stories: 46 failed actions inside "COMPLETED" missions, a WP05 Pipe Gallery hot spot, battery below 20% drops action success to 27%, and V2 beats V1 even at equal battery.
- Part Two is the **2019 Spot User Guide**: IP54, -20 to 45 C, "light rain" OK, no water jets, no wet grass or ice. Nothing on wind or lightning. Comms loss makes Spot sit after 3 s and cut motor power after 8 s.
- Weather fits as **one layer** on a data-insight dashboard, plus the engineer's verbal ask. It cannot be the whole product.

## The two files
| File | Size | What it is |
|---|---|---|
| `SPOT_KnightHacks_Challenge_Kit Part One.zip` | 21 MiB | Brief, data assumptions, 7 data files, data dictionary, 18 real Orbit screenshots, fictional floor plan and legend, 6 sample inspection images, 3 Python starter scripts |
| `SPOT_KnightHacks_Challenge_Kit Part Two.zip` | 34 MiB | Spot User Guide, Release 1.1 (2019), 72 pages split into 4 PDFs |

Originals are unmodified (SHA-256 matches the downloads). Extracted copies live outside the repo.

## The problem NextEra wants solved
Devpost text: help plant operators understand what SPOT is seeing. Turn mission data into a clear view of locations, timestamps, readings and anomaly flags, **in real time and after a mission**. Make it actionable. Build operator confidence without making them technical experts.

Kit brief questions: what happened, where, why it matters, what needs attention, is performance improving or degrading, what to investigate next. "More than simply displaying raw tables." Surface relationships that would otherwise need manual investigation.

**NextEra evaluation themes:** operational usefulness, insight, usability, technical execution, creativity, explainability.

Suggested questions from the kit:
- Can a mission complete while actions inside it fail?
- Which inspection types are least reliable?
- Are failures concentrated at certain locations?
- Is battery related to reliability?
- Are anomalies hidden in successful missions?
- Does V2 differ from V1?
- Can an operator find the most important issue fast?
- What else does the replay stream show?

Rule: all data is synthetic. Explain every assumption we add.

## The data
| File | Rows | Key fields |
|---|---|---|
| missions.csv | 27 | mission_id, scenario (BASELINE/IMPROVED), configuration_version (V1/V2), start/end, duration_min, start/end battery, mission_status, operator_mode (all AUTOWALK) |
| actions.csv | 270 | mission_id, sequence, timestamp, location_id, asset_id, action_type, battery_pct, status, failure_type, duration_sec |
| readings.csv | 220 | action_id, measurement_type, value, unit, quality (GOOD/QUESTIONABLE) |
| anomalies.csv | 40 | action_id, anomaly_type, severity (LOW to CRITICAL), operator_review_required, description |
| locations.csv | 15 | WP01-WP15, zone_type, floor (1-2), x/y coords, environment (NORMAL, INDOOR_DUSTY, INDOOR_DRY, LOW_LIGHT, HIGH_NOISE) |
| assets.csv | 20 | asset_type (heat exchanger, panel, pump, motor, valve, gauge, compressor), location_id, criticality |
| replay.ndjson | 500 events | MISSION_STARTED, ACTION_STARTED/COMPLETED/FAILED, MISSION_COMPLETED |

- **Time range:** Sep 1 to Sep 10, 2026. Missions run 3 times a day: 02:00, 10:00, 18:00.
- **Formats:** CSV and NDJSON.
- **Images:** 6 synthetic JPGs, about 240x166 px, one per class: motor, thermal bearing, acoustic spectrogram, pressure gauge, valve, pipe corridor. Good for a zero-shot demo. Too few to train on. None shows water or a wet floor.
- **No weather, route geometry, or outdoor areas.**

### What the data shows (computed from the kit)
- **Hidden failures:** 26 of 27 missions say COMPLETED, yet 46 failed actions sit inside them. 14 of 15 HIGH/CRITICAL anomalies are in COMPLETED missions.
- **Least reliable inspections:** acoustic 70%, gauge 74%, navigation 82%, thermal 86%, visual 91% success.
- **Hot spots:** WP05 Pipe Gallery has the most anomalies (8) and navigation fails 33% there in V1 (the kit's own check says 28%). WP09 Turbine Hall South: 64% success.
- **Battery:** action success is 27% below 20% battery, 72% at 20-39%, 86-90% above 40%. V1 missions drain about 56% in 29 min; V2 about 28% in 22 min.
- **V1 vs V2 is confounded:** V2 missions never run below 40% battery. Inside the same battery band, V2 still wins (40-59%: 85% vs 100%; 60-79%: 86% vs 92%). So V2 is better, but part of the raw gap is battery.
- **Failure types (V1):** READING_UNRELIABLE 12, SENSOR_TIMEOUT 10, TARGET_NOT_DETECTED 7, LOCALIZATION_FAILURE 5.
- **Data quality traps:**
  - In 61 of 270 actions, the location does not match the asset's home location in assets.csv.
  - 50 actions have no reading.
  - The replay covers only 23 of 27 missions and stops mid-mission (M023).
  - The replay has no MISSION_FAILED event.
- **Anomalies vs failures:** 32 of 40 anomalies come from FAILED actions, and 8 from successful ones.

## Spot limits and behavior (Part Two guide, 2019 R1.1)
- **Weather:**
  - -20 to 45 C. IP54.
  - "Light rain" is allowed. No water jets, no submerging.
  - No wet grass or ice. Liquids make surfaces slippery.
  - Wind and lightning are not mentioned.
- **Battery and temperature:**
  - About 90 min runtime, 605 Wh, hot-swappable. Swap below 40%.
  - Cold shortens runtime.
  - A hot battery stops Spot from powering on.
- **Comms loss:** Spot sits after 3 s and cuts motor power after 8 s. That is risky on stairs and slopes, so a recall must happen before the link degrades.
- **Autowalk:**
  - Replay starts at a fiducial and supports pause, resume, skip and abort.
  - It needs a supervising operator, and it is not for stairs, people or dynamic sites.
  - Failure modes map to the dataset: "lost" = LOCALIZATION_FAILURE, "stuck" = PATH_BLOCKED, and the comms icon = COMMUNICATION_LOSS. SENSOR_TIMEOUT has no direct match.
- **Perception:** needs light above 2 lux. Cannot see glass or cliff edges. Weak with objects under 30 cm.
- **Caveat:** this 2019 guide has no docking, Orbit, scheduling, thermal, acoustic or gauge AI. Those come from newer Spot products (see the Orbit screenshots).

## Orbit screenshots (real NextEra-approved captures)
- **Screens shown:** Inspections list, Missions, Mission Dashboard, Map editor.
- **What Orbit already does well:**
  - Per-capture analysis: thermal min/max, acoustic level against a threshold, gauge reads at 99% confidence, AI yes/no checks with boxes.
  - Do not rebuild this.
- **Gaps we can fill:**
  - No weather, go/no-go, schedule control, live battery or dock status. The battery column says "No data available".
  - No triage queue: anomalies are a flat date-sorted list.
  - Anomalies are not linked to the map.
  - Some missions fail often with no reason shown. "All Acoustic and Thermal" succeeded 3 of 11 times.
  - Operators split routes by hand to avoid stairs.
- **Real captures show outdoor decks.** So real Spot routes do go outside, even though the kit facility does not.
- **Design language:** dark navy top bar, blue pill tabs, charcoal panels, green NOMINAL / red ANOMALY / yellow WARN, list-left with detail-right.

## Against our starting plan
| Plan item | Verdict |
|---|---|
| Weather GO/HOLD/RECALL | **Changes.** Not in the brief or the data. Keep it as one layer, because the engineer asked for it and Orbit lacks it. Needs an invented outdoor leg (e.g. WP01 entrance apron), stated as an assumption. |
| Dispatch view: queue, status + reason, timeline, decision log | **Confirmed**, if "status" means the true status (hidden failures, anomalies), not just weather. |
| Neon for all data | **Confirmed.** Kit data maps cleanly to tables. |
| Fine-tune for flooding / standing water | **Weak fit.** The kit has no water images, and the facility is indoor. Better fits for their data: gauge-state reading (gauges are the least reliable inspection), or wet-floor/leak detection indoors. See PLAN.md. |
| Figma | **Confirmed.** It matches a usability-focused operator tool. |

## Gaps to ask NextEra (10:15 workshop)
See the question list in `docs/PLAN.md`.
