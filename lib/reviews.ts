"use server";

import { refresh } from "next/cache";
import { readDb, writeDb } from "./operator.ts";

// Operator triage of anomalies, stored in Neon. The latest review per anomaly is its current state.
export type ReviewStatus = "acknowledged" | "work_order" | "dismissed" | "reopened";
export type Review = { anomaly_id: string; status: ReviewStatus; note: string | null; created_at: string };

const STATUSES: ReviewStatus[] = ["acknowledged", "work_order", "dismissed", "reopened"];

// Operator: main. Visitor: their own Neon branch (lib/operator.ts). A refusal saves nothing and never writes main.
// note: the triage forms ignore return values, so a refusal shows only in the sandbox status line.
export async function reviewAnomaly(form: FormData) {
  const anomalyId = String(form.get("anomalyId"));
  const status = String(form.get("status")) as ReviewStatus;
  const note = form.get("note") ? String(form.get("note")).slice(0, 280) : null;
  if (!/^AN\d{3}$/.test(anomalyId)) throw new Error("bad anomaly id");
  if (!STATUSES.includes(status)) throw new Error("bad status");
  const target = await writeDb(true);
  if ("refused" in target) return console.error(`review not saved: ${target.refused}`);
  await target.sql`INSERT INTO anomaly_reviews (anomaly_id, status, note) VALUES (${anomalyId}, ${status}, ${note})`;
  refresh();
}

/** Current state per anomaly: the latest review row, keyed by anomaly id. Reopened counts as no review. */
export async function currentReviews(): Promise<Record<string, Review>> {
  // note: a separate const, because the production build drops the parens in (await readDb())`...` and tags the promise.
  const sql = await readDb();
  const rows = (await sql`SELECT DISTINCT ON (anomaly_id) anomaly_id, status, note, created_at::text AS created_at
                           FROM anomaly_reviews ORDER BY anomaly_id, id DESC`) as Review[];
  return Object.fromEntries(rows.filter((r) => r.status !== "reopened").map((r) => [r.anomaly_id, r]));
}

/** Recent triage activity for the activity feed. */
export async function recentReviews(limit = 8): Promise<Review[]> {
  const sql = await readDb();
  return (await sql`SELECT anomaly_id, status, note, created_at::text AS created_at
                     FROM anomaly_reviews ORDER BY id DESC LIMIT ${limit}`) as Review[];
}
