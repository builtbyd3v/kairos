// Live round: NextEra's replay stream (data/kit/replay.ndjson) played back up to a moment, for one mission.

export type EventType = "MISSION_STARTED" | "ACTION_STARTED" | "ACTION_COMPLETED" | "ACTION_FAILED" | "MISSION_COMPLETED";

export type LiveEvent = {
  id: string;
  missionId: string;
  at: number; // kit time in ms, see kitMs
  type: EventType;
  actionId?: string;
  locationId?: string;
  assetId?: string;
  actionType?: string;
  battery?: number;
  failureType?: string;
  status?: string;
};

export type LiveAnomaly = { id: string; actionId: string; type: string; severity: string };
export type LiveReading = { actionId: string; type: string; value: number; unit: string; quality: string };
export type Truth = "CLEAN" | "DEGRADED" | "NEEDS REVIEW";
export type Phase = "starting" | "inspecting" | "done" | "stream ended";

// Kit timestamps have no zone. Reading them as UTC keeps the clock identical on server and browser.
export const kitMs = (s: string) => Date.parse(`${s}Z`);
export const kitClock = (ms: number) => new Date(ms).toISOString().slice(11, 19);
export const kitDate = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");

// note: the stream has no heartbeat. 5 min of silence without MISSION_COMPLETED reads as a lost stream (actions arrive about 3 min apart).
export const STREAM_TIMEOUT_MS = 5 * 60_000;

export function parseEvents(ndjson: string): LiveEvent[] {
  return ndjson
    .trim()
    .split("\n")
    .map((line) => {
      const e = JSON.parse(line);
      const d = e.details ?? {};
      return {
        id: e.event_id,
        missionId: e.mission_id,
        at: kitMs(e.timestamp),
        type: e.event_type,
        actionId: d.action_id,
        locationId: d.location_id,
        assetId: d.asset_id,
        actionType: d.action_type,
        battery: d.battery_pct ?? d.end_battery_pct,
        failureType: d.failure_type || undefined,
        status: d.status,
      };
    });
}

/** When playback of one mission's events stops: its completion, or the stream timeout after its last event. */
export function endOf(events: LiveEvent[]) {
  const last = events.at(-1)!;
  return last.type === "MISSION_COMPLETED" ? last.at : last.at + STREAM_TIMEOUT_MS;
}

const finishes = (e: LiveEvent) => e.type === "ACTION_COMPLETED" || e.type === "ACTION_FAILED";

/** What the operator knows at kit time t, given only events at or before t. */
export function liveState(events: LiveEvent[], t: number, anomalies: LiveAnomaly[], readings: LiveReading[]) {
  const seen = events.filter((e) => e.at <= t);
  const current = seen.filter((e) => e.type === "ACTION_STARTED").at(-1);
  const finished = seen.filter(finishes);
  const results: Record<string, "ok" | "failed"> = Object.fromEntries(finished.map((e) => [e.actionId, e.type === "ACTION_FAILED" ? "failed" : "ok"]));
  const failed = finished.filter((e) => e.type === "ACTION_FAILED").length;
  // An anomaly is only known once the inspection that found it has finished.
  const found = anomalies.filter((a) => a.actionId in results);
  const serious = found.filter((a) => a.severity === "HIGH" || a.severity === "CRITICAL").length;
  const completion = seen.find((e) => e.type === "MISSION_COMPLETED");
  const phase: Phase = completion ? "done" : t >= endOf(events) ? "stream ended" : current ? "inspecting" : "starting";
  const truth: Truth = serious > 0 ? "NEEDS REVIEW" : failed > 0 ? "DEGRADED" : "CLEAN";
  const readingOf = new Map(readings.map((r) => [r.actionId, r]));
  const lastReading = finished.flatMap((e) => readingOf.get(e.actionId!) ?? []).at(-1);
  return {
    phase,
    reported: completion?.status ?? "IN PROGRESS",
    current,
    battery: seen.findLast((e) => e.battery !== undefined)?.battery,
    done: finished.length,
    failed,
    results,
    events: seen,
    anomalies: found,
    serious,
    truth,
    lastReading,
  };
}

export type LiveState = ReturnType<typeof liveState>;
