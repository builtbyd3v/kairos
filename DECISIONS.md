# Decisions

Each entry: what we chose, what we rejected, and why.

## Product
1. **Data truth first, weather as the gate.** NextEra's written brief asks for insight from mission data, and the kit has no weather. Their engineer asked for weather in person. We made weather one input to a per-round verdict built on the kit's real health data. Rejected: a weather-only dashboard, which ignores the scored brief.
2. **Operator confirms, the system advises.** Every verdict has Confirm and Override buttons, and both are logged. Rejected: automatic recall, because a NextEra operator owns go/no-go and a wrong automatic recall on stairs is its own hazard (Spot cuts motor power 8 s after a comms loss).
3. **Weather only gates outdoor routes.** An indoor round stays GO in a storm. Rejected: holding every round on any alert, which would cry wolf and lose operator trust.
4. **Unknown is never green.** Missing or stale weather holds outdoor rounds. Rejected: falling back to GO.

## Rules
5. **Battery rule comes from the kit's own data.** HOLD if Spot would reach the dock under 20%, using measured drain rates (V1 about 1.9%/min, V2 about 1.3%/min). Below 20%, kit inspections succeed 27% of the time. Rejected: the guide's "swap under 40%", which is a startup rule, not a launch rule.
6. **Thresholds we invented are labeled as ours.** Thunder 30%, gust 50 km/h, 5 °C margin. Rejected: presenting them as NextEra or Boston Dynamics limits.
7. **Rain limit 2.5 mm/h.** This is where "light rain" ends (AMS). The guide allows light rain only. Orbit's launch gate checks a forecast amount (configurable up to 5 mm), not a rate; we cite it next to ours.

## Replay
8. **No hindsight.** At time T the replay sees only alerts already issued and observations up to T. Rejected: feeding the real future into the rules, which would make the dispatcher look prescient.
9. **Real storm, real plant.** The replay is the May 19, 2024 pop-up thunderstorm (no watch beforehand). It uses NWS alerts and the Fort Pierce ASOS station near NextEra's St. Lucie plant. Only warnings whose polygon contains the plant count, like `api.weather.gov/alerts/active?point=`.
10. **Return time from geometry, not battery.** Straight-line distance from Spot's waypoint to the dock at 1 m/s, plus 1 min per floor. Stairs are assumed walkable, which the guide discourages for Autowalk; labeled in the UI. Rejected: guessing from battery.
15. **The replay's headline is honest about its signals.** The thunder rule (station 21 km away) recalls first and is flagged as our assumption; the screen also shows when the NWS warning alone would have recalled. The 12:00 launch is labeled as an extra round, not a kit schedule time.

## Tech
11. **Neon as the system of record.** Kit tables plus a `decisions` audit log written by server actions. Each storm drill session writes to its own copy-on-write Neon branch (`lib/neon-branch.ts`), and Incident review reads the log from a branch made at a past minute. Rejected: one shared table reset with a delete, which lets two judges' drills collide and cannot answer "what did the log say at 12:15". If the Neon API fails, writes fall back to main and the page says so.
12. **Rules are pure functions with tests** (`lib/verdict.ts`, `npm test`). The live board, the replay and the backtest all run the same code.
13. **Server Components by default.** The only client component is the replay player, which needs a clock and a slider.
14. **Design: IBM Carbon dark tokens plus Orbit's navy bar.** It reads as an enterprise tool that sits next to Orbit, and its contrast is verified (WCAG AA). Status is always color, icon and word. Sat morning: moved to a warm charcoal palette with caps card labels and load motion (rising cards, count-up numbers, growing bars), all off under reduced motion. See DESIGN.md.

## Model
16. **Fine-tune a small open vision model for wet floors.** ConvNeXt-Tiny (Apache-2.0) is small enough for the browser, and as a CNN it can be explained with heatmaps. Rejected: zero-shot CLIP only (71.8% accuracy), and a paid hosted endpoint.
17. **Lead with the honest number.** Dry and wet images mostly came from different datasets, so we report the single-source wet recall (92.7%) next to the headline 99.6%, plus the off-domain false alarms on NextEra's images.
18. **Run it in the browser.** transformers.js with an ONNX export: no server GPU, and no image leaves the operator's machine. Trade-off: a one-time model download.
19. **Advisory only.** A wet frame holds the waypoint for an operator. "No water detected" never means safe.
