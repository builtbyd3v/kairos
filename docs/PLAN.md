# Kairos: plan

## TL;DR
- **Idea (locked):** Spot's dispatcher. Before every inspection round, it combines Spot's real health (from NextEra's mission data) with the weather and says GO, HOLD or RECALL, with a plain reason and the rule behind it.
- **Gap we fill:** Orbit only checks rain before launch. Once Spot is out, nothing watches the sky, and nothing checks heat, lightning or wind. Mission status also hides failures: 46 failed inspections sit inside "COMPLETED" missions.
- **Wow moment:** replay a real storm at NextEra's St. Lucie plant. The board goes GO → HOLD → RECALL with "Spot needs X min to dock, storm arrives in Y".
- **Tracks:** NextEra (core), Neon (system of record, decision log, branch per replay), Hugging Face (fine-tuned wet-floor model), Figma Best Design. Auto-entered: Best Overall, Best AI.
- **One number:** 46 failed inspections hidden inside COMPLETED missions, surfaced at zero clicks. Model number: baseline vs fine-tuned accuracy on a held-out set.

## The problem
- **NextEra's written brief:** help operators understand what Spot is seeing, in real time and after a mission, and act on it without being technical experts.
- **What a NextEra engineer told us in person:** they want weather solutions: Spot should see rain at the dock door, and catch small puddles and spills mid-route.
- **What Orbit does today** (verified on Boston Dynamics' support site):
  - Mission schedules can block a launch when the forecast rain is above a limit or the rain chance over the next 3 hours is too high.
  - In-progress missions are never paused or recalled when the forecast changes.
  - There is no temperature, lightning or wind check.

## The product
| Part | What the operator sees | Source |
|---|---|---|
| Next round verdict | GO / HOLD / RECALL, reasons with sources, confirm or override | lib/verdict.ts rules + live NWS + Open-Meteo |
| Hidden-truth tiles | Reported COMPLETED vs actually clean, hidden failures, serious anomalies | Neon, kit data |
| Attention queue | Anomalies ranked by severity, then asset criticality, flagged if hidden in a COMPLETED mission | Neon |
| Facility map | 15 waypoints on 2 floors, success rate and anomaly count | Neon |
| Insights | Battery vs success (V1 vs V2 inside the same battery band), least reliable inspection types | Neon |
| Mission table | Reported status next to what actually happened | Neon |
| Decision log | Every confirm or override, with reasons and the simulated Orbit call | Neon `decisions` table |
| Storm replay | The 2025-05-05 storm on a timeline. The verdict flips live and the return-time race counts down | Scripted fixture from IEM/NCEI records |

## Rules (cited in the UI)
| Rule | Verdict | Source |
|---|---|---|
| NWS warning (severe thunderstorm, tornado, flash flood, extreme heat, tropical) | HOLD before launch, RECALL in mission | NWS alerts |
| NWS watch or advisory | HOLD | NWS alerts |
| Rain above 2.5 mm/h in the mission window | HOLD / RECALL | Spot guide p.22, p.61 (light rain only, IP54); Orbit's launch gate checks the rain forecast only at launch |
| Route has no outdoor leg | Weather does not gate it | Route map |
| Light rain | GO with a wet-floor caution | Spot guide p.21-22 |
| Thunder chance ≥ 30% | HOLD / RECALL | Assumption (guide is silent) |
| Gusts ≥ 50 km/h | HOLD / RECALL | Assumption (guide is silent) |
| Air temperature within 5 C of -20 / 45 C | HOLD / RECALL | Spot guide p.22 |
| Projected battery at the dock under 20% | HOLD | Kit drain rates (V1 1.9%/min, V2 1.3%/min); kit: 27% action success under 20% |
| Weather missing or older than 30 min | HOLD | Missing data never looks green |
| Waypoint on route under 75% success | Advisory | Kit data |

## Assumptions (shown on screen)
- The site is NextEra's St. Lucie Plant, FL. The kit facility is fictional.
- Each round has an outdoor leg at the WP01 entrance. The kit is indoor-only, but NextEra's real Orbit captures show outdoor decks.
- Battery at launch equals the last mission's start battery. The kit has no live telemetry.
- Orbit calls are simulated. They use real endpoint names: schedule toggle for HOLD, send-robot-to-dock for RECALL.

## Scope
- **Done:**
  - Neon schema + seed
  - verdict engine with 6 tests
  - live NWS + Open-Meteo
  - dashboard
  - decision log
  - deployed at https://spot-ops-pi.vercel.app
- **Core (before judging):**
  - design system applied
  - storm replay with return-time race
  - mission and anomaly drill-down
  - Neon branch per replay (reset between judges)
  - README, DECISIONS.md, INTERVIEW.md
  - demo video
- **Stretch:**
  - wet-floor model (convnext-tiny, Mendeley CC BY + Kaggle CC0) on the Hub, run in the browser
  - point-in-time incident review via a Neon branch at a timestamp
  - Figma flows
- **Cut:**
  - live lightning network
  - real Orbit integration
  - LLM summaries
  - auth
  - mobile layout (later)

## Questions for the NextEra workshop (Sat 10:15, BA1 119)
1. Which Spot routes at your plants go outdoors, and for how long is Spot exposed?
2. What weather has actually stopped or damaged a Spot: rain, heat, lightning, wind, or a slip on a wet surface? What limits do your procedures use?
3. Who decides to launch or recall a round today, with what information? Must a person confirm a HOLD or RECALL?
4. Is it OK to add an assumed outdoor leg and real NWS weather on top of the synthetic kit for judging?
5. When a mission is STOPPED in Orbit, where does the reason go? The Mission Log in your screenshots is empty.
6. Can you share any real Spot camera frames (wet or dry floors) so we can test the wet-floor model on your environment?
