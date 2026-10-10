# Kairos

**Spot's dispatcher.** Before every inspection round, Kairos combines Boston Dynamics Spot's real mission health with the weather and says **GO**, **HOLD** or **RECALL**, with a plain reason and the rule behind it. While Spot is out, it keeps watching, and it recalls Spot when a storm arrives.

Built at Knight Hacks IX (UCF, Oct 9-11 2026) for the NextEra Energy "SPOT Management Dashboard" challenge.

**Live:** https://kairos.boston (backup: https://spot-ops-pi.vercel.app)

**What it is:** a plugin-style layer for Boston Dynamics Orbit, not a replacement. Orbit runs the missions; Kairos decides when Spot should go, wait, or come home, and watches the floor for water.

## Why
- **Mission status hides failures.** In NextEra's challenge data, 26 of 27 missions report COMPLETED, yet 46 inspections inside them failed, and 14 of 15 serious anomalies sit inside "successful" missions.
- **Spot doesn't know the weather.** Spot is rated IP54 (splashes, light rain). Orbit has a weather scheduler that can block a launch, and it can send Spot back to the dock, but nothing decides *when* to call Spot home mid-round from lightning, wind, heat and battery together. Autowalk missions keep running when the radio link drops, so that call has to be made early.
- **Water on the floor.** NextEra's Spot engineers told us small puddles and spills on the route are a real problem. No forecast can see the floor.

## What it does
An operator console that opens on "what needs me right now".

| Page | What the operator gets |
|---|---|
| Today | Shift greeting, KPI strip, 24-hour readiness forecast (GO/HOLD per hour and per scheduled round), weather alert banner, the "Needs you" triage inbox (create work order, acknowledge, dismiss, reopen; saved in Neon), next-round verdict with confirm/override, shift brief, activity feed. |
| Live round | NextEra's replay stream played as a live mission: Spot on the map, event feed, "true status so far", and an automatic wet-floor check when Spot reaches the outdoor leg. |
| Anomalies | Full triage inbox with evidence ("what Spot saw", context, why it needs you). |
| Missions | Reported status next to what actually happened; per-mission action timeline with readings, anomalies, sample inspection images. |
| Waypoints | Where failures concentrate: per-location success, failure types, V1 vs V2, asset mismatches in the kit. |
| Work orders | Work orders created from triage, prioritized P1-P3 by severity and asset criticality. |
| Insights | Battery vs success, inspection reliability, V1 vs V2 within the same battery band, weather backtest, decision log. |
| Shift handoff | A printable plain-English handoff for the next operator. |
| Storm drill | A real pop-up storm at St. Lucie (2024-05-19) replayed with no hindsight: mid-round recall before the NWS warning. Each drill session runs on its own Neon branch, copied from main in about 2 s, so a judge's clicks never touch production data. |
| Incident review | The decision log exactly as it was at any minute in the last 6 hours: Neon branches main at that moment, the page reads it, then deletes the branch. |
| Floor check | Our fine-tuned wet-floor model running in the browser. |

⌘K jumps to any page, mission, waypoint or anomaly. On a phone, the sidebar becomes a bottom tab bar.

## Sponsor tech, and why each one is load-bearing
| Sponsor | What it does in Kairos | Without it |
|---|---|---|
| NextEra | Their SPOT challenge kit is the robot-health data behind every verdict; their Spot engineers' feedback set the scope (weather + water on the route). | No health input, no real problem. |
| Hugging Face | Our fine-tuned water model (`builtbyd3v/spot-wetfloor-convnext-tiny`), served from the Hub and run in the browser with transformers.js. | Kairos can see the sky but not the floor. |
| Neon | Kit tables, the decision audit log, a copy-on-write branch per storm drill, and point-in-time Incident review. | No audit trail, and judges' drills would overwrite each other. |
| GoDaddy Registry | The `kairos.boston` domain. | |

## The numbers
- **46** failed inspections hide inside missions reported COMPLETED (26 of 27 say COMPLETED; 5 are actually clean). Counted from the kit, synthetic data.
- **Weather backtest:** at the kit's 27 real round times, on archive weather for the plant, Kairos would hold 1 round for weather and 9 for battery. It does not cry wolf.
- **Model:** see Model below, including the honest number.

## Rules
Every rule is in `lib/verdict.ts` and cited in the UI.
- NWS warning → HOLD before launch, RECALL during a round. NWS watch or advisory → HOLD.
- Rain above 2.5 mm/h (beyond "light rain", Spot guide p.22) → HOLD / RECALL. Ours is a rate checked through the whole round, not only at launch.
- Thunder chance ≥ 30%, gusts ≥ 50 km/h → HOLD / RECALL. These are **our assumptions**, because the guide is silent.
- Air temperature within 5 °C of Spot's -20 / 45 °C limits (2019 guide; Boston Dynamics' current spec says up to 55 °C) → HOLD / RECALL.
- Projected battery at the dock under 20% (from the kit's drain rates) → HOLD.
- Weather only gates routes with an outdoor leg. Missing or stale weather never shows GO for an outdoor route.

## Data
- `data/kit/`: NextEra's synthetic SPOT challenge kit (missions, actions, readings, anomalies, locations, assets, replay events). Loaded into Neon by `npm run db:seed`.
- `data/replay/`: real NWS alerts and ASOS observations for the replay, plus Open-Meteo archive weather for the backtest. Sources: `data/replay/SOURCES.md`.
- Live weather: api.weather.gov (alerts + forecast grid) and Open-Meteo (15-minute rain).

## Assumptions
- Site: St. Lucie Plant, FL. The kit facility is fictional.
- WP01's entrance apron is the outdoor leg, and WP15 is the dock.
- Kit x/y units are meters. Spot walks at 1 m/s, plus 1 min per floor change.
- Orbit calls are simulated, using real Orbit API endpoint names.

## Stack
Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind v4 · shadcn/ui · Neon Postgres (`@neondatabase/serverless`) · Hugging Face transformers.js + a fine-tuned ConvNeXt-Tiny · Vercel.

## Model
Fine-tuned `facebook/convnext-tiny-224` on Mendeley water/wet-surface images (CC BY 4.0) and a CC0 Kaggle public-spaces set. Held-out test (752 images): 99.6% accuracy vs 71.8% for zero-shot CLIP. **Honest number:** 90.2% wet recall (37 of 41) for the int8 model that runs in the browser on single-source images (92.7% at full precision), because the full score is partly inflated by dataset source. It flagged 2 of 6 dry NextEra kit images as wet. Details: `docs/model/RESULTS.md`.

## Run it
```bash
npm install
vercel env pull .env.local   # or set DATABASE_URL to any Neon/Postgres URL
npm run db:seed              # creates tables and loads the kit
npm run dev                  # http://localhost:3000
npm test                     # dispatcher rule tests
```

## Disclosure (Knight Hacks rules)
Everything below was used in this project. All project code, the fine-tuned model, and the data pipeline were made during the event (hacking began Fri 2026-10-09, 11 PM EDT).
- **AI tools:** Claude Code (Anthropic Claude models) wrote most of the code under our direction. OpenAI Codex was used as a second research and planning agent. We chose the problem and the rules, made every product and design decision, and reviewed and tested the output. Decisions and trade-offs are in `DECISIONS.md`.
- **Base model:** `facebook/convnext-tiny-224` (Apache 2.0), fine-tuned by us into `builtbyd3v/spot-wetfloor-convnext-tiny`. Zero-shot CLIP was used only as a baseline for comparison.
- **Datasets:** Bhutad, S. and Patil, K. (2021), *Dataset of Stagnant Water and Wet Surface with Annotations*, Mendeley Data V4, doi:10.17632/y6zyrnxbfm.4 (CC BY 4.0). Kaggle `muftirestumahesa` public-spaces sets (CC0). Details: `docs/model/RESULTS.md`.
- **Challenge data:** NextEra Energy's SPOT KnightHacks Challenge Kit (synthetic missions, actions, readings, anomalies, replay events, sample images).
- **APIs and weather data:** National Weather Service api.weather.gov (alerts, forecast grid, ASOS observations); Open-Meteo forecast and archive (https://open-meteo.com, CC BY 4.0).
- **Libraries and services:** Next.js, React, Tailwind CSS, shadcn/ui and Radix UI, lucide-react icons, Geist fonts, Hugging Face transformers.js, Neon Postgres (`@neondatabase/serverless`), Vercel hosting. Domain `kairos.boston` via the MLH GoDaddy Registry offer.
- **Repo history:** the first commit (Fri 2026-10-09, 7:54 PM EDT) is GitHub's empty repo setup only (a title line and `.gitattributes`). No project code existed before hacking began.
