import { neon } from "@neondatabase/serverless";
import { cacheLife } from "next/cache";

// NextEra's synthetic SPOT kit, read from Neon (seeded by scripts/seed.mts) and joined in memory.

export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type Mission = {
  id: string;
  name: string;
  config: string;
  start: string;
  durationMin: number;
  startBattery: number;
  endBattery: number;
  status: string;
};

export type Action = {
  id: string;
  missionId: string;
  timestamp: string;
  locationId: string;
  assetId: string;
  type: string;
  battery: number;
  ok: boolean;
  failureType: string;
  config: string;
};

export type Anomaly = {
  id: string;
  actionId: string;
  missionId: string;
  locationId: string;
  assetId: string;
  timestamp: string;
  type: string;
  severity: Severity;
  reviewRequired: boolean;
};

export type Location = {
  id: string;
  name: string;
  zone: string;
  floor: number;
  x: number;
  y: number;
  environment: string;
};

export type Asset = { id: string; name: string; criticality: string };

export type Reading = { actionId: string; type: string; value: number; unit: string; quality: string };

export async function loadKit() {
  "use cache";
  cacheLife("hours");

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Run `vercel env pull .env.local`.");
  const sql = neon(url);
  // Timestamps come back as text so the UI shows the kit's local times exactly as recorded.
  const [m, a, an, lo, as, rd] = await Promise.all([
    sql`SELECT *, start_time::text AS start_time FROM missions ORDER BY mission_id`,
    sql`SELECT *, timestamp::text AS timestamp FROM actions ORDER BY action_id`,
    sql`SELECT *, timestamp::text AS timestamp FROM anomalies ORDER BY anomaly_id`,
    sql`SELECT * FROM locations ORDER BY location_id`,
    sql`SELECT * FROM assets ORDER BY asset_id`,
    sql`SELECT action_id, measurement_type, value, unit, quality FROM readings ORDER BY reading_id`,
  ]);

  const missions: Mission[] = m.map((r) => ({
    id: r.mission_id,
    name: r.mission_name,
    config: r.configuration_version,
    start: r.start_time,
    durationMin: Number(r.duration_min),
    startBattery: Number(r.start_battery_pct),
    endBattery: Number(r.end_battery_pct),
    status: r.mission_status,
  }));
  const actions: Action[] = a.map((r) => ({
    id: r.action_id,
    missionId: r.mission_id,
    timestamp: r.timestamp,
    locationId: r.location_id,
    assetId: r.asset_id,
    type: r.action_type,
    battery: Number(r.battery_pct),
    ok: r.status === "SUCCESS",
    failureType: r.failure_type,
    config: r.configuration_version,
  }));
  const anomalies: Anomaly[] = an.map((r) => ({
    id: r.anomaly_id,
    actionId: r.action_id,
    missionId: r.mission_id,
    locationId: r.location_id,
    assetId: r.asset_id,
    timestamp: r.timestamp,
    type: r.anomaly_type,
    severity: r.severity as Severity,
    reviewRequired: r.operator_review_required === true,
  }));
  const locations: Location[] = lo.map((r) => ({
    id: r.location_id,
    name: r.location_name,
    zone: r.zone_type,
    floor: Number(r.floor),
    x: Number(r.x_coord),
    y: Number(r.y_coord),
    environment: r.environment,
  }));
  const assets: Asset[] = as.map((r) => ({ id: r.asset_id, name: r.asset_name, criticality: r.criticality }));
  const readings: Reading[] = rd.map((r) => ({ actionId: r.action_id, type: r.measurement_type, value: Number(r.value), unit: r.unit, quality: r.quality }));

  return { missions, actions, anomalies, locations, assets, readings };
}

export type Kit = Awaited<ReturnType<typeof loadKit>>;

const SEVERITY_RANK: Record<Severity, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
const CRITICALITY_RANK: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

export const pct = (ok: number, total: number) => (total ? Math.round((100 * ok) / total) : 0);

function rate(actions: Action[]) {
  return { ok: actions.filter((a) => a.ok).length, total: actions.length };
}

// Everything the dashboard shows, derived from the raw kit in one place so the numbers stay consistent.
export function analyze({ missions, actions, anomalies, locations, assets }: Kit) {
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const locationById = new Map(locations.map((l) => [l.id, l]));
  const missionById = new Map(missions.map((m) => [m.id, m]));

  const missionRows = missions.map((m) => {
    const acts = actions.filter((a) => a.missionId === m.id);
    const anoms = anomalies.filter((a) => a.missionId === m.id);
    const failed = acts.filter((a) => !a.ok).length;
    const serious = anoms.filter((a) => SEVERITY_RANK[a.severity] >= 3).length;
    // "True status": what the operator should believe, not what the robot reported.
    const truth = m.status !== "COMPLETED" ? "FAILED" : serious > 0 ? "NEEDS REVIEW" : failed > 0 ? "DEGRADED" : "CLEAN";
    return { ...m, actions: acts.length, failed, anomalies: anoms.length, serious, truth };
  });

  const completed = missionRows.filter((m) => m.status === "COMPLETED");
  const hiddenFailures = completed.reduce((n, m) => n + m.failed, 0);
  const seriousAnoms = anomalies.filter((a) => SEVERITY_RANK[a.severity] >= 3);
  const seriousHidden = seriousAnoms.filter((a) => missionById.get(a.missionId)?.status === "COMPLETED").length;

  // Attention queue: anomaly severity first, then how critical the asset is, newest first.
  const queue = anomalies
    .map((a) => {
      const asset = assetById.get(a.assetId);
      return {
        ...a,
        assetName: asset?.name ?? a.assetId,
        criticality: asset?.criticality ?? "UNKNOWN",
        locationName: locationById.get(a.locationId)?.name ?? a.locationId,
        hidden: missionById.get(a.missionId)?.status === "COMPLETED",
        score: SEVERITY_RANK[a.severity] * 10 + (CRITICALITY_RANK[asset?.criticality ?? ""] ?? 0),
      };
    })
    .sort((x, y) => y.score - x.score || y.timestamp.localeCompare(x.timestamp));

  const byType = [...new Set(actions.map((a) => a.type))]
    .map((type) => ({ type, ...rate(actions.filter((a) => a.type === type)) }))
    .sort((x, y) => x.ok / x.total - y.ok / y.total);

  const bands = [0, 20, 40, 60, 80].map((lo) => {
    const inBand = actions.filter((a) => a.battery >= lo && a.battery < lo + 20);
    return {
      band: `${lo}-${lo + 19}%`,
      all: rate(inBand),
      v1: rate(inBand.filter((a) => a.config === "V1")),
      v2: rate(inBand.filter((a) => a.config === "V2")),
    };
  });

  const configs = ["V1", "V2"].map((config) => {
    const ms = missions.filter((m) => m.config === config);
    const avg = (f: (m: Mission) => number) => Math.round(ms.reduce((n, m) => n + f(m), 0) / ms.length);
    return {
      config,
      missions: ms.length,
      ...rate(actions.filter((a) => a.config === config)),
      avgDuration: avg((m) => m.durationMin),
      avgDrain: avg((m) => m.startBattery - m.endBattery),
      minBattery: Math.min(...actions.filter((a) => a.config === config).map((a) => a.battery)),
    };
  });

  const sites = locations.map((l) => {
    const acts = actions.filter((a) => a.locationId === l.id);
    return { ...l, ...rate(acts), anomalies: anomalies.filter((a) => a.locationId === l.id).length };
  });

  return {
    missionRows,
    queue,
    byType,
    bands,
    configs,
    sites,
    totals: {
      missions: missions.length,
      reportedCompleted: completed.length,
      clean: missionRows.filter((m) => m.truth === "CLEAN").length,
      hiddenFailures,
      seriousHidden,
      serious: seriousAnoms.length,
      range: [missions[0]?.start, missions.at(-1)?.start] as const,
    },
  };
}
