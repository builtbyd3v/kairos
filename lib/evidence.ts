"use server";

import { neon } from "@neondatabase/serverless";
import type { Verdict } from "./verdict";

// Water evidence in Neon: every detection is a row, operators confirm or reject it, and eval scores come from a frozen branch.

/** What the water model returns for one frame. Box and areaFrac are normalized to the frame (0..1). */
export type WaterDetection = { box: { x: number; y: number; w: number; h: number }; score: number; areaFrac: number };
/** Where the frame came from and what the round decided. weather is the snapshot the verdict used (any JSON, max 8 kB). */
export type DetectionContext = {
  frameUri: string; // "/path/in/public.jpg" or an https URL
  frameSha256: string; // 64 lowercase hex chars of the frame bytes
  source: string; // "live", "floor-check", ...
  license: string;
  waypoint: string | null;
  modelId: string;
  modelRevision: string;
  weather: unknown;
  rulesVersion: string;
  verdict: Verdict | null;
};
export type DetectionInput = WaterDetection & DetectionContext;

export type Label = "confirm" | "reject";
export type EvidenceRow = {
  id: number;
  created_at: string;
  frame_uri: string;
  source: string;
  license: string;
  waypoint: string | null;
  model_id: string;
  model_revision: string;
  score: number;
  box_x: number;
  box_y: number;
  box_w: number;
  box_h: number;
  area_frac: number;
  verdict: Verdict | null;
  seeded: boolean;
  label: Label | null;
  operator: string | null;
  labeled_at: string | null;
};
export type EvalScore = {
  run_at: string;
  branch_name: string;
  branch_as_of: string;
  model_id: string;
  model_revision: string;
  detections: number;
  confirmed: number;
  rejected: number;
  precision: number | null;
};

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

const VERDICTS: Verdict[] = ["GO", "HOLD", "RECALL"];
const LABELS: Label[] = ["confirm", "reject"];

function fail(field: string): never {
  throw new Error(`bad ${field}`);
}
function unit(v: unknown, field: string): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1 ? v : fail(field);
}
function text(v: unknown, field: string, max: number, pattern?: RegExp): string {
  return typeof v === "string" && v.trim() && v.length <= max && (!pattern || pattern.test(v)) ? v.trim() : fail(field);
}

/** Saves one water detection and returns its id. Server-only write; the caller passes validated-or-not input and this checks every field. */
// note: no auth, same as decisions and reviews. Fine for a demo console, not for a plant.
export async function recordDetection(input: DetectionInput): Promise<{ id: number }> {
  if (typeof input !== "object" || input === null || typeof input.box !== "object" || input.box === null) fail("input");
  const { x, y, w, h } = input.box;
  const box = { x: unit(x, "box.x"), y: unit(y, "box.y"), w: unit(w, "box.w"), h: unit(h, "box.h") };
  if (box.w === 0 || box.h === 0 || box.x + box.w > 1.0001 || box.y + box.h > 1.0001) fail("box");
  const weather = input.weather === undefined || input.weather === null ? null : JSON.stringify(input.weather);
  if (weather !== null && weather.length > 8000) fail("weather");
  if (input.verdict !== null && !VERDICTS.includes(input.verdict)) fail("verdict");
  const row = {
    frameUri: text(input.frameUri, "frameUri", 500, /^(\/(?!\/)|https:\/\/)\S+$/),
    frameSha256: text(input.frameSha256, "frameSha256", 64, /^[0-9a-f]{64}$/),
    source: text(input.source, "source", 24, /^[a-z][a-z-]*$/),
    license: text(input.license, "license", 120),
    waypoint: input.waypoint === null ? null : text(input.waypoint, "waypoint", 32, /^[A-Za-z0-9_-]+$/),
    modelId: text(input.modelId, "modelId", 120, /^[\w.-]+(\/[\w.-]+)?$/),
    modelRevision: text(input.modelRevision, "modelRevision", 80, /^[\w.@-]+$/),
    rulesVersion: text(input.rulesVersion, "rulesVersion", 40),
    score: unit(input.score, "score"),
    areaFrac: unit(input.areaFrac, "areaFrac"),
  };
  const [{ id }] = await db()`INSERT INTO detections (frame_uri, frame_sha256, source, license, waypoint, model_id, model_revision, score,
                                box_x, box_y, box_w, box_h, area_frac, weather, rules_version, verdict)
    VALUES (${row.frameUri}, ${row.frameSha256}, ${row.source}, ${row.license}, ${row.waypoint}, ${row.modelId}, ${row.modelRevision}, ${row.score},
            ${box.x}, ${box.y}, ${box.w}, ${box.h}, ${row.areaFrac}, ${weather}, ${row.rulesVersion}, ${input.verdict})
    RETURNING id::int AS id`;
  return { id: id as number };
}

/** Confirm/Reject form action. Labels are append-only; the latest one per detection counts. */
export async function labelDetection(form: FormData) {
  const raw = String(form.get("detectionId") ?? "");
  const id = /^\d{1,12}$/.test(raw) ? Number(raw) : fail("detectionId");
  const label = String(form.get("label")) as Label;
  if (!LABELS.includes(label)) fail("label");
  const operator = text(String(form.get("operator") ?? "operator"), "operator", 40);
  const note = form.get("note") ? String(form.get("note")).slice(0, 280) : null;
  const sql = db();
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM detections WHERE id = ${id}`;
  if (n === 0) fail("detectionId");
  await sql`INSERT INTO detection_labels (detection_id, label, operator, note) VALUES (${id}, ${label}, ${operator}, ${note})`;
  // note: imported here so node --test can load this file (plain Node cannot resolve the extensionless next/cache).
  (await import("next/cache")).refresh();
}

/** Newest detections first, each with its current label. */
export async function listDetections(limit = 50): Promise<EvidenceRow[]> {
  return (await db()`SELECT d.id::int AS id, d.created_at::text AS created_at, d.frame_uri, d.source, d.license, d.waypoint, d.model_id, d.model_revision,
                            d.score, d.box_x, d.box_y, d.box_w, d.box_h, d.area_frac, d.verdict, d.seeded, l.label, l.operator, l.created_at::text AS labeled_at
                     FROM detections d
                     LEFT JOIN LATERAL (SELECT label, operator, created_at FROM detection_labels WHERE detection_id = d.id ORDER BY id DESC LIMIT 1) l ON true
                     ORDER BY d.id DESC LIMIT ${limit}`) as EvidenceRow[];
}

/** The latest eval run: one row per model revision, scored on a frozen Neon branch by scripts/eval-branch.mts. */
export async function latestEval(): Promise<EvalScore[]> {
  return (await db()`SELECT run_at::text AS run_at, branch_name, branch_as_of::text AS branch_as_of, model_id, model_revision, detections, confirmed, rejected, precision
                     FROM eval_runs WHERE run_at = (SELECT max(run_at) FROM eval_runs) ORDER BY model_id, model_revision`) as EvalScore[];
}
