# Dogwatch

**Spot's dispatcher.** Before every inspection round, Dogwatch combines Boston Dynamics Spot's real mission health with the weather and says **GO**, **HOLD** or **RECALL**, with a plain reason and the rule behind it. While Spot is out, it keeps watching, and it recalls Spot when a storm arrives.

Built at Knight Hacks IX (UCF, Oct 9-11 2026) for the NextEra Energy "SPOT Management Dashboard" challenge.

Live: https://spot-ops-pi.vercel.app

## Why
- **Mission status hides failures.** In NextEra's challenge data, 26 of 27 missions report COMPLETED, yet 46 inspections inside them failed, and 14 of 15 serious anomalies sit inside "successful" missions.
- **Spot doesn't know the weather.** Spot is rated IP54 (splashes, light rain) for -20 to 45 °C. Orbit's schedule can block a *launch* on a rain forecast, but nothing recalls Spot once it is out, and nothing checks heat, lightning or wind.

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
| Storm drill | A real pop-up storm at St. Lucie (2024-05-19) replayed with no hindsight: mid-round recall before the NWS warning. |
| Floor check | Our fine-tuned wet-floor model running in the browser. |

⌘K jumps to any page, mission, waypoint or anomaly. On a phone, the sidebar becomes a bottom tab bar.

## Rules
Every rule is in `lib/verdict.ts` and cited in the UI.
- NWS warning → HOLD before launch, RECALL during a round. NWS watch or advisory → HOLD.
- Rain above 2.5 mm/h (beyond "light rain", Spot guide p.22) → HOLD / RECALL. Orbit's launch gate checks a forecast amount (configurable up to 5 mm); ours is a rate.
- Thunder chance ≥ 30%, gusts ≥ 50 km/h → HOLD / RECALL. These are **our assumptions**, because the guide is silent.
- Air temperature within 5 °C of Spot's -20 / 45 °C limits → HOLD / RECALL.
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
Fine-tuned `facebook/convnext-tiny-224` on Mendeley water/wet-surface images (CC BY 4.0) and a CC0 Kaggle public-spaces set. Held-out test (752 images): 99.6% accuracy vs 71.8% for zero-shot CLIP. **Honest number:** 92.7% wet recall on single-source images, because the full score is partly inflated by dataset source. It flagged 2 of 6 dry NextEra kit images as wet. Details: `docs/model/RESULTS.md`.

## Run it
```bash
npm install
vercel env pull .env.local   # or set DATABASE_URL to any Neon/Postgres URL
npm run db:seed              # creates tables and loads the kit
npm run dev                  # http://localhost:3000
npm test                     # dispatcher rule tests
```

## Built with AI
Code was written with AI coding agents (Claude Code) under the team's direction. The team owned the product, design decisions, review and testing. Decisions and trade-offs are in `DECISIONS.md`.
