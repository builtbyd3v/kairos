import type { Kit } from "./kit";
import type { LiveEvent } from "./live";

// Data traps: places where the kit, charted naively, would mislead an operator. Every number is recomputed here.

export type Trap = { id: string; title: string; figure: string; meaning: string; how: string };

const share = (ok: number, total: number) => (total ? Math.round((100 * ok) / total) : 0);

export function dataTraps(kit: Pick<Kit, "missions" | "actions" | "anomalies" | "assets" | "readings">, events: LiveEvent[]): Trap[] {
  const { missions, actions, anomalies, assets, readings } = kit;
  const n = actions.length;
  const okPct = (xs: typeof actions) => share(xs.filter((a) => a.ok).length, xs.length);
  const of = (config: string, lo = 0, hi = 101) => actions.filter((a) => a.config === config && a.battery >= lo && a.battery < hi);

  // 1. V1 vs V2 confounded by battery: compare inside 20-point bands where both configs have actions.
  const v2Min = Math.min(...of("V2").map((a) => a.battery));
  const bands = [0, 20, 40, 60, 80]
    .filter((lo) => of("V1", lo, lo + 20).length && of("V2", lo, lo + 20).length)
    .map((lo) => `${lo}-${lo + 19}%: ${okPct(of("V1", lo, lo + 20))}% vs ${okPct(of("V2", lo, lo + 20))}%`);

  // 2. Action logged at a different waypoint than the asset's home location.
  const home = new Map(assets.map((a) => [a.id, a.location]));
  const moved = actions.filter((a) => home.get(a.assetId) !== a.locationId).length;

  // 3. Actions with no reading row.
  const read = new Set(readings.map((r) => r.actionId));
  const unread = actions.filter((a) => !read.has(a.id)).length;

  // 4. Replay stream coverage.
  const streamed = new Set(events.map((e) => e.missionId));
  const last = events.at(-1);
  const cutOff = last && !events.some((e) => e.missionId === last.missionId && e.type === "MISSION_COMPLETED") ? last.missionId : null;
  const failedMissions = missions.filter((m) => m.status !== "COMPLETED").length;
  const failedEvents = events.filter((e) => (e.type as string) === "MISSION_FAILED").length;

  // 5. Anomalies raised on actions that succeeded.
  const ok = new Map(actions.map((a) => [a.id, a.ok]));
  const quiet = anomalies.filter((a) => ok.get(a.actionId)).length;

  return [
    {
      id: "battery",
      title: "V1 vs V2 is confounded by battery",
      figure: `${okPct(of("V1"))}% vs ${okPct(of("V2"))}% raw`,
      meaning: `V2 is better, but part of its raw lead is battery: V2 never ran below ${v2Min}%. Same battery band: ${bands.join("; ")}.`,
      how: "Action success by configuration, then again inside 20-point battery bands where both configurations ran.",
    },
    {
      id: "location",
      title: "Asset and location disagree",
      figure: `${moved} of ${n}`,
      meaning: "Do not map an asset by the action's location alone. Check assets.csv before sending a crew.",
      how: "actions.location_id compared with the asset's location_id in assets.csv.",
    },
    {
      id: "readings",
      title: "Actions with no reading",
      figure: `${unread} of ${n}`,
      meaning: "A missing reading is not a normal reading. Treat the asset as uninspected.",
      how: "Actions with no row in readings.csv, matched on action_id.",
    },
    {
      id: "replay",
      title: "The replay stream is incomplete",
      figure: `${streamed.size} of ${missions.length} missions`,
      meaning: `Do not use the live feed as the record.${cutOff ? ` It stops mid-mission (${cutOff}).` : ""} It has ${failedEvents} MISSION_FAILED events, yet missions.csv lists ${failedMissions} failed.`,
      how: "Distinct mission_id in replay.ndjson; last mission checked for MISSION_COMPLETED; event types counted.",
    },
    {
      id: "anomalies",
      title: "Anomalies hide in successful actions",
      figure: `${quiet} of ${anomalies.length}`,
      meaning: "A SUCCESS action can still find a problem. Review anomalies, not only failed actions.",
      how: "anomalies.csv joined to actions.csv on action_id, counting status SUCCESS.",
    },
  ];
}
