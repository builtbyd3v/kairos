# Decisions

Each entry: what I chose, what I rejected, and why.

## Product
1. **A weather and water dashboard that plugs into Orbit, usable today.** NextEra's Spot team named two problems: weather on the route is not caught as early as they want, with a storm that builds mid-route as the hard case, and small puddles and spills on the route. Kairos does exactly those two things, as a layer on Orbit. Rejected (Sat evening): leading with an autonomous "dock door" launch gate, because Spot leaving a garage on its own is a future goal, not something an operator can use now. It stays one sentence in the pitch.
2. **Operator confirms, the system advises.** Every verdict has Confirm and Override buttons, and both are logged. Rejected: automatic recall, because a NextEra operator owns go/no-go and a wrong automatic recall on stairs is its own hazard. Depending on the comms-loss policy and timeout, an Autowalk mission can keep running on the robot when the link drops (Boston Dynamics network configuration docs; confirmed at the NextEra workshop), so a recall has to be sent while Spot is still in coverage.
3. **Weather only gates outdoor routes.** An indoor round stays GO in a storm. Rejected: holding every round on any alert, which would cry wolf and lose operator trust.
4. **Unknown is never green.** Missing or stale weather holds outdoor rounds. Rejected: falling back to GO.

## Rules
5. **Battery rule comes from the kit's own data.** HOLD if Spot would reach the dock under 20%, using measured drain rates (V1 about 1.9%/min, V2 about 1.3%/min). Below 20%, kit inspections succeed 27% of the time. Rejected: the guide's "swap under 40%", which is a startup rule, not a launch rule.
6. **Thresholds I invented are labeled as mine.** Thunder 30%, gust 50 km/h, 5 °C margin. Rejected: presenting them as NextEra or Boston Dynamics limits.
7. **Rain limit 2.5 mm/h.** This is where "light rain" ends (AMS). The guide allows light rain only. Orbit's launch gate checks the rain forecast at launch; Kairos checks the rain rate until Spot docks.

## Replay
8. **No hindsight.** At time T the replay sees only alerts already issued and observations up to T. Rejected: feeding the real future into the rules, which would make the dispatcher look prescient.
9. **Real storm, real plant.** The replay is the May 19, 2024 pop-up thunderstorm (no watch beforehand). It uses NWS alerts and the Fort Pierce ASOS station near NextEra's St. Lucie plant. Only warnings whose polygon contains the plant count, like `api.weather.gov/alerts/active?point=`.
10. **Return time from geometry, not battery.** Straight-line distance from Spot's waypoint to the dock at 1 m/s, plus 1 min per floor. Stairs are assumed walkable, which the guide discourages for Autowalk; labeled in the UI. Rejected: guessing from battery.
15. **The replay's headline is honest about its signals.** The thunder rule (station 21 km away) recalls first and is flagged as my assumption; the screen also shows when the NWS warning alone would have recalled. The 12:00 launch is labeled as an extra round, not a kit schedule time.

## Tech
11. **Neon as the system of record.** Kit tables plus a `decisions` audit log written by server actions. Each storm drill session writes to its own copy-on-write Neon branch (`lib/neon-branch.ts`), and Incident review reads the log from a branch made at a past minute. Rejected: one shared table reset with a delete, which lets two judges' drills collide and cannot answer "what did the log say at 12:15". If the Neon API or a branch fails, the write is refused and the page says so; it never falls back to main.
12. **Rules are pure functions with tests** (`lib/verdict.ts`, `npm test`). The live board, the replay and the backtest all run the same code.
13. **Server Components by default.** The only client component is the replay player, which needs a clock and a slider.
14. **Design: one state per card, details behind a toggle.** A warm charcoal palette with Geist type; status is always color, icon and word. Each card shows one big call and one line; sources, assumptions and caveats sit behind an info toggle, and one "Demo" label covers the whole app. Rejected: explaining every number inline, which judges will not read in five minutes.

## Model
16. **Fine-tune a small open vision model for wet floors.** ConvNeXt-Tiny (Apache-2.0) is small enough for the browser, and as a CNN it can be explained with heatmaps. Rejected: zero-shot CLIP only (71.8% accuracy), and a paid hosted endpoint.
17. **Lead with the honest number.** Dry and wet images mostly came from different datasets, so I report the single-source wet recall (92.7%) next to the headline 99.6%, plus the off-domain false alarms on NextEra's images.
18. **Run it in the browser.** transformers.js with an ONNX export: no server GPU, and no image leaves the operator's machine. Trade-off: a one-time model download.
19. **Advisory only.** A wet frame holds the waypoint for an operator. "No water detected" never means safe.
20. **Second model: a detector, not a classifier.** v1 (ConvNeXt) said "this whole frame looks wet". v2 fine-tunes RT-DETRv2-R18 (Apache-2.0) to draw a box around each puddle, so Kairos can tell water *in Spot's path* from water beside it. Rejected: YOLO (AGPL) and SegFormer / Mask2Former (non-commercial licenses), unusable for a utility. Trained on Hugging Face Jobs (about $1 of free credits).
21. **Splits by scene and source, threshold on a separate calibration split.** Test photos come from a puddle source the model never trained on, plus whole recordings from a real Spot camera. Rejected: random splits, which leak near-duplicate frames and inflate scores.
22. **Confidence as a calibrated %.** A raw score of 0.56 means little to an operator, so each box shows how often boxes at that score were real water on the calibration split ("water 70%"). Rejected: showing raw scores.
23. **The door-rain camera model does not gate anything.** I trained one, deduplicated its splits, and found it learned "gray sky" rather than rain at a door: near chance on cameras it never saw, and almost no afternoon rain caught. Weather data decides; the model card says so. Rejected: letting a near-chance model hold Spot.
24. **WebGPU in full precision.** The int8 file ran at 1.3 s per frame in the browser because WebGPU has no int8 matrix kernel; fp32 on WebGPU runs at 67 ms. int8 stays as the WASM fallback. I also patched two float64 casts in the exported graph that browsers cannot run (outputs identical).

## Demo and safety
25. **A recorded real storm is the default scenario.** I captured live NWS, Open-Meteo and radar during a real St. Lucie storm (Sat 5:56 PM ET) and replay it, with a Live switch. Rejected: fake weather, and a live-only demo that shows GO if the sky clears at judging time.
26. **Every visitor gets their own Neon branch.** The link is public on Devpost, so a visitor's Confirm, Reject or decision lands on a copy-on-write branch of production; only an operator key writes to main. Rejected: a read-only demo (judges could not try the flow) and a shared table (anyone could wipe it).
27. **One camera capture per waypoint, driven by the mission.** The map, camera, progress bar and decision share one index, so they always describe the same moment. Rejected: a separate camera clock, which drifted from the route.
