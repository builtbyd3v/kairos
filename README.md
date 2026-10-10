# Kairos

**A weather and water dashboard for Boston Dynamics Spot, built as a plugin for Orbit.** Spot is rated IP54: light rain is fine, harsh rain and storms are not, and no forecast can see a puddle in its path. Kairos watches both on every round: when the weather turns mid-round it says **RECALL**, and when Spot's camera sees water in its path it says **HOLD** until an operator confirms. Every call is logged.

Built at Knight Hacks IX (UCF, Oct 9-11 2026) for the NextEra Energy "SPOT Management Dashboard" challenge.

**Live:** https://kairos.boston · **Intro video:** `public/intro/intro.mp4`

## Why
- **NextEra's Spot engineer told us the two problems directly:** Spot cannot see a storm coming once it is out on its route, and small puddles and spills on the route are hard to catch.
- **Orbit gates the launch, not the round.** Orbit can block a launch on a rain forecast. Nothing keeps checking rain, thunder, gusts and heat against Spot's limits while the round is running, and recalling Spot mid-round on weather needs a custom integration. Kairos is that integration.
- **Spot is IP54.** Splashes and light rain only. Above 2.5 mm/h (the end of "light rain") Spot should not be out.

## What it does
| Page | What the operator gets |
|---|---|
| **Dashboard** | Rain vs Spot's IP54 limit: the call for a Spot on route right now (RECALL / HOLD / GO), the rain rate against the limit, thunder, gusts and heat, and a 12-hour rain chart with the IP54 line and the next safe launch. Live radar around the plant. The latest water Spot's camera found on the route, with Confirm / Reject. The next round's call. |
| **Live round** | One simulated round: Spot walks its route, its camera checks every waypoint, a spill in the path holds Spot until the operator answers, and the recorded storm triggers a recall back to the dock. |
| **Storm drill** | A real pop-up storm at St. Lucie (2024-05-19), replayed minute by minute with no hindsight: the recall fires before the NWS warning. |
| **Water model** | Try the model on your own photo, in the browser. Honest held-out numbers, and what each confidence % means. |
| **Evidence** | Every water detection and operator label, stored in Neon, and each model version scored on a frozen Neon branch. |
| **Incident review** | Saved moments (storm hold, puddle confirmed, drill recall) read back from Neon snapshot branches, plus any minute in the last 6 hours. |

**Scenario switch (top bar):** *Recorded storm* replays a real St. Lucie storm captured Sat Oct 10, 5:56 PM ET (NWS + Open-Meteo + 50 minutes of radar), so the demo works whatever the sky does. *Live* uses the feeds right now.

## How it fits Orbit
Kairos is a layer on top of Orbit, not a replacement. Mission data comes from Orbit. A HOLD maps to pausing the schedule and a RECALL to sending Spot to the dock (Orbit API v0 endpoint names, **simulated** in this demo). The water model runs wherever Spot's camera frames are: in the browser today, on Spot's CORE I/O as a Network Compute Bridge worker in a real deployment.

## Sponsor tech, and why each one is load-bearing
| Sponsor | What it does in Kairos | Without it |
|---|---|---|
| NextEra | The challenge (a Spot management dashboard), the robot data (synthetic SPOT kit), and the problem itself, from their Spot engineer. | No problem worth solving and no robot data. |
| Hugging Face | Our water detector, fine-tuned from RT-DETRv2-R18 on Hugging Face Jobs, published on the Hub with an honest model card, and run in the browser with transformers.js (WebGPU, about 67 ms per frame). | Kairos can see the sky but not the floor. |
| Neon | The evidence log (every detection and label), a frozen branch that scores each model version, a copy-on-write branch per visitor and per storm drill so nobody's clicks touch production, and snapshot branches for Incident review. | No audit trail, no model scoring, and a public demo anyone could break. |
| GoDaddy Registry | The `kairos.boston` domain. | |

## The numbers (all on public photos; no NextEra camera frames exist)
- **Water model, held out (never trained on):** flags 85% of wet photos from a puddle source it never saw (463 of 543); 1.2 false alarms per 100 frames from a camera on a real Spot (2 of 172). **Known gap:** tiny puddles under 1% of the frame, 6 of 57. Details: `docs/model/water-v2/RESULTS.md`.
- **Confidence that means something:** "water 90%" means 9 in 10 boxes at that score were real water, measured on a calibration split (315 boxes) and checked on test (680 boxes). `docs/model/water-v2/CONFIDENCE.md`.
- **Speed:** 67 ms per frame (p50, p95 89 ms) in Chrome on WebGPU.
- **Weather backtest:** at the kit's 27 round times, on archive weather for the plant, Kairos would hold 1 round for weather. It does not cry wolf.

## Rules (all in `lib/verdict.ts`, cited in the UI)
- Rain above 2.5 mm/h before Spot can dock (beyond IP54's light rain) → HOLD before launch, RECALL during a round.
- NWS warning → HOLD / RECALL. NWS watch or advisory → HOLD.
- Thunder chance ≥ 30%, gusts ≥ 50 km/h → HOLD / RECALL (**our assumptions**: the Spot guide is silent).
- Air temperature within 5 °C of Spot's -20 / 55 °C limits → HOLD / RECALL.
- Water in Spot's path → HOLD at that waypoint until an operator confirms or rejects. An unknown floor (model loading or failed) also holds.
- Missing or stale weather never shows GO.

## Run it
```bash
npm install
vercel env pull .env.local   # or set DATABASE_URL to any Neon/Postgres URL
npm run db:seed              # tables + the kit
npm run dev                  # http://localhost:3000
npm test                     # rule, model-confidence, branch-routing tests
```
`OPERATOR_KEY` (env) lets an operator write to production; everyone else writes to their own Neon branch.

## Disclosure (Knight Hacks rules)
All project code, both fine-tuned models and the data pipelines were made during the event (hacking began Fri 2026-10-09, 11 PM EDT).
- **AI tools:** Claude Code (Anthropic Claude models) wrote most of the code under our direction; OpenAI Codex reviewed facts and evaluations. We chose the problem, the rules and every product decision, and reviewed and tested the output. Decisions and trade-offs: `DECISIONS.md`. The intro narration uses the macOS built-in voice.
- **Base models:** `PekingU/rtdetr_v2_r18vd` (Apache 2.0), fine-tuned by us into `builtbyd3v/kairos-water-rtdetr`. Earlier experiments: `facebook/convnext-tiny-224` (Apache 2.0) into `builtbyd3v/spot-wetfloor-convnext-tiny` and `builtbyd3v/kairos-door-rain`.
- **Datasets:** Bhutad and Patil (2021), *Dataset of Stagnant Water and Wet Surface with Annotations*, Mendeley Data V4, doi:10.17632/y6zyrnxbfm.4 (CC BY 4.0); Roboflow Universe `slipp/spill_detection`, `hk-hsse/puddle-qrpyh` and `projects-pwwbs/water-puddle-joyj6` (CC BY 4.0); Kaggle `muftirestumahesa` obstacles in public spaces (CC0); UT Austin SCAND, Karnan et al., doi:10.18738/T8/0PRYRH (CC0); for the door-rain experiment, Kaggle Weather Image Recognition (CC0), Multi-class Weather Dataset (CC BY 4.0) and Weather-Time (CC0).
- **Challenge data:** NextEra Energy's SPOT KnightHacks Challenge Kit (synthetic).
- **APIs and weather data:** National Weather Service api.weather.gov; Open-Meteo (CC BY 4.0); NEXRAD radar tiles via the Iowa Environmental Mesonet; map tiles © OpenStreetMap contributors.
- **Libraries and services:** Next.js, React, Tailwind CSS, shadcn/ui, Radix UI, lucide-react, Geist, Hugging Face transformers.js and Jobs, Neon Postgres, Vercel. Domain via the MLH GoDaddy Registry offer.
- **Repo history:** the first commit (Fri 2026-10-09, 7:54 PM EDT) is GitHub's empty repo setup only (a title line and `.gitattributes`). No project code existed before hacking began.
