# SPOT Dispatch

**Spot's dispatcher.** Before every inspection round, SPOT Dispatch combines Boston Dynamics Spot's real mission health with the weather and says **GO**, **HOLD** or **RECALL**, with a plain reason and the rule behind it. While Spot is out, it keeps watching, and it recalls Spot when a storm arrives.

Built at Knight Hacks IX (UCF, Oct 9-11 2026) for the NextEra Energy "SPOT Management Dashboard" challenge.

Live: https://spot-ops-pi.vercel.app

## Why
- **Mission status hides failures.** In NextEra's challenge data, 26 of 27 missions report COMPLETED, yet 46 inspections inside them failed, and 14 of 15 serious anomalies sit inside "successful" missions.
- **Spot doesn't know the weather.** Spot is rated IP54 (splashes, light rain) for -20 to 45 °C. Orbit's schedule can block a *launch* on a rain forecast, but nothing recalls Spot once it is out, and nothing checks heat, lightning or wind.

## What it does
| Screen | What the operator gets |
|---|---|
| Dispatch board | Next round verdict with reasons and sources, confirm or override. True mission status vs reported. Attention queue ranked by severity and asset criticality. Two-floor facility map. Battery and inspection-type insights. Weather backtest. Decision log. |
| Mission page | What happened in plain words, the route on the map, every action with its reading and anomaly. |
| Storm replay | A real storm afternoon at NextEra's St. Lucie plant, replayed minute by minute with no hindsight. The verdict flips live, and a recall shows how long Spot needs to reach the dock. |

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
Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind v4 · shadcn/ui · Neon Postgres (`@neondatabase/serverless`) · Vercel.

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
