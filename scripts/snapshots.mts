// Incident review snapshots: for each moment, seeds the rows it needs on main (additive, marked seeded), then cuts a
// named Neon branch snap-<name> of main. The review page lists them from the snapshots table and reads each branch read-only.
// Idempotent: a moment whose branch exists is skipped. Never deletes or edits rows on main. Run: npm run db:snapshots
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { createBranch, listBranches } from "../lib/neon-branch.ts";
import { decide, ORBIT_CALL, type Weather } from "../lib/verdict.ts";
import { weatherAt, type StormFixture } from "../lib/replay.ts";

const url = process.env.DATABASE_URL;
if (!url || !process.env.NEON_API_KEY) throw new Error("DATABASE_URL and NEON_API_KEY must be set. Run with --env-file=.env.local.");
await import("./migrate.mts"); // additive schema: decisions.seeded and the snapshots table
const sql = neon(url);
const HISTORY_MS = 6 * 3600_000; // Neon Free history window: a branch can start up to 6 h in the past

const recorded = JSON.parse(readFileSync("data/demo/weather-snapshot.json", "utf8")) as { recordedAt: string; weather: Weather };
const storm = JSON.parse(readFileSync("data/replay/storm-2024-05-19.json", "utf8")) as StormFixture;

/** Worst conditions within an hour either side of t: what the dispatcher was looking at. */
function summary(w: Weather, t: number, source: string) {
  const near = w.steps.filter((s) => Math.abs(Date.parse(s.time) - t) <= 3600_000);
  const max = (k: "precipMmPerHour" | "thunderPct" | "gustKmh") => Math.max(0, ...near.map((s) => s[k] ?? 0));
  return { source, at: new Date(t).toISOString(), alerts: w.alerts, precipMmPerHour: max("precipMmPerHour"), thunderPct: max("thunderPct"), gustKmh: max("gustKmh") };
}

const branches = new Set((await listBranches()).map((b) => b.name));
async function snapshot(m: { name: string; label: string; at: string; verdict: string | null; decided: string; why: string; weather: object; parentTimestamp?: string }) {
  const branch = `snap-${m.name}`;
  // The row goes in before the branch, so the branch carries its own label too.
  await sql`INSERT INTO snapshots (name, label, at, verdict, decided, why, weather, branch_as_of)
            VALUES (${m.name}, ${m.label}, ${m.at}, ${m.verdict}, ${m.decided}, ${m.why}, ${JSON.stringify(m.weather)}, ${m.parentTimestamp ?? new Date().toISOString()})
            ON CONFLICT (name) DO UPDATE SET label = EXCLUDED.label, at = EXCLUDED.at, verdict = EXCLUDED.verdict, decided = EXCLUDED.decided,
              why = EXCLUDED.why, weather = EXCLUDED.weather, branch_as_of = EXCLUDED.branch_as_of`;
  const b = await createBranch({ name: branch, parentTimestamp: m.parentTimestamp });
  console.log(`${branch}: created in ${b.ms} ms${m.parentTimestamp ? `, as of ${m.parentTimestamp}` : ""}`);
}

// (1) puddle-confirmed, 5:53 PM ET: a live-round water detection confirmed by the operator. Real rows when they exist, else seeded.
if (!branches.has("snap-puddle-confirmed")) {
  let [p] = await sql`SELECT d.id::int AS id, l.created_at, d.waypoint, d.score FROM detections d JOIN detection_labels l ON l.detection_id = d.id
                      WHERE d.source = 'live' AND l.label = 'confirm' ORDER BY l.id LIMIT 1`;
  if (!p) {
    // note: seeded copy of the live round's approach-6 frame and the real RT-DETR box it produced; marked seeded.
    const [{ id }] = await sql`INSERT INTO detections (frame_uri, frame_sha256, source, license, waypoint, model_id, model_revision, score, box_x, box_y, box_w, box_h, area_frac, rules_version, verdict, seeded)
      VALUES ('/captures/approach-6.jpg', 'ce7c0c538fdebd21b58c0bd4ccb468806ff9f394dcaabf14251a0a59bcf457ee', 'live', 'CC0 1.0 (kaggle)', 'WP01', 'builtbyd3v/kairos-water-rtdetr',
              '54c3bb405fdce4fcc27294d10051e1ae87ac2942', 0.644, 0.3605, 0.1409, 0.2918, 0.3349, 0.0977, 'verdict.ts vision v2 lane', 'HOLD', true) RETURNING id::int AS id`;
    await sql`INSERT INTO detection_labels (detection_id, label, operator, note) VALUES (${id}, 'confirm', 'seeded operator', 'Seeded by scripts/snapshots.mts')`;
    [p] = await sql`SELECT d.id::int AS id, l.created_at, d.waypoint, d.score FROM detections d JOIN detection_labels l ON l.detection_id = d.id WHERE d.id = ${id}`;
  }
  const at = new Date(p.created_at as string);
  // Inside the history window: branch main as it was 1 s after the confirm, so later rows are not in it.
  const asOf = Date.now() - at.getTime() < HISTORY_MS - 600_000 ? new Date(at.getTime() + 1000).toISOString() : undefined;
  await snapshot({
    name: "puddle-confirmed",
    label: "Puddle confirmed on the live round",
    at: at.toISOString(),
    verdict: "HOLD",
    decided: `Water at ${p.waypoint ?? "the route"} confirmed; Spot avoids it and the next round holds`,
    why: `The water model flagged the frame at p(water) ${Math.round(Number(p.score) * 100)}% in Spot's path, and the operator confirmed it (evidence #${p.id}).`,
    weather: summary(recorded.weather, Date.parse(recorded.recordedAt), "Recorded NWS + Open-Meteo, St. Lucie plant"),
    parentTimestamp: asOf,
  });
}

// (2) storm-hold, 5:56 PM ET: the recorded storm held the launch for rain. Seeded decision at the recorded clock, with its receipt.
if (!branches.has("snap-storm-hold")) {
  // note: reason texts are the ones the app logged for this scenario (decision #7, recorded storm, M027); copied, not recomputed.
  const reasons = [
    { text: "Rain up to 2.8 mm/h before Spot can dock; Spot is rated for light rain and splashes only (IP54)", source: "Spot guide p.22, p.61. Orbit's launch gate checks the rain forecast; this checks the rain rate until Spot docks", verdict: "HOLD" },
    { text: "43% chance of thunder before Spot can dock", source: "NWS forecast grid; threshold is our assumption", verdict: "HOLD" },
  ];
  await sql`WITH d AS (INSERT INTO decisions (created_at, mission_id, verdict, reasons, source, operator_action, orbit_call, seeded)
              SELECT ${recorded.recordedAt}, 'M027', 'HOLD', ${JSON.stringify(reasons)}, 'live', 'confirmed', ${ORBIT_CALL.HOLD}, true
              WHERE NOT EXISTS (SELECT 1 FROM decisions WHERE seeded AND verdict = 'HOLD' AND created_at = ${recorded.recordedAt}) RETURNING *)
            INSERT INTO receipts (kind, ref, at, body) SELECT 'decision', id::text, created_at, to_jsonb(d) FROM d`;
  await snapshot({
    name: "storm-hold",
    label: "Recorded storm holds the launch",
    at: recorded.recordedAt,
    verdict: "HOLD",
    decided: "Launch held; Orbit schedule paused",
    why: `${reasons[0].text}. ${reasons[1].text}.`,
    weather: summary(recorded.weather, Date.parse(recorded.recordedAt), "Recorded NWS + Open-Meteo, St. Lucie plant"),
  });
}

// (3) storm-drill-recall: the 2024-05-19 drill, first minute the in-progress verdict turns RECALL. Seeded drill decision.
if (!branches.has("snap-storm-drill-recall")) {
  const health = { outdoor: true, batteryPct: 90, projectedEndPct: 70, routeRisk: [] }; // weather only: a healthy robot isolates the storm
  let t = Date.parse(storm.window.start);
  let r = decide(weatherAt(storm, t), health, { now: new Date(t), start: new Date(t), end: new Date(t + 45 * 60000) }, true);
  for (; r.verdict !== "RECALL" && t < Date.parse(storm.window.end); t += 60000)
    r = decide(weatherAt(storm, t + 60000), health, { now: new Date(t + 60000), start: new Date(t + 60000), end: new Date(t + 60000 + 45 * 60000) }, true);
  if (r.verdict !== "RECALL") throw new Error("the 2024-05-19 storm never forced a recall; check the fixture");
  const reasons = r.reasons.filter((x) => x.verdict === "RECALL");
  await sql`INSERT INTO decisions (mission_id, verdict, reasons, source, operator_action, orbit_call, seeded)
            SELECT NULL, 'RECALL', ${JSON.stringify(reasons)}, 'replay', 'confirmed', ${ORBIT_CALL.RECALL}, true
            WHERE NOT EXISTS (SELECT 1 FROM decisions WHERE seeded AND source = 'replay' AND verdict = 'RECALL')`;
  const stormEt = new Date(t).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
  await snapshot({
    name: "storm-drill-recall",
    label: `Storm drill recalls Spot (2024-05-19 storm, ${stormEt} ET)`,
    at: new Date().toISOString(),
    verdict: "RECALL",
    decided: "Spot recalled to the dock mid-round",
    why: reasons.map((x) => x.text).join(". ") + ".",
    weather: summary(weatherAt(storm, t), t, storm.alerts.length ? "Fort Pierce ASOS + NWS alerts, 2024-05-19" : "Fort Pierce ASOS"),
  });
}

console.table(await sql`SELECT name, label, at::text, verdict, branch_as_of::text FROM snapshots ORDER BY at`);
