"use server";

import { neon } from "@neondatabase/serverless";
import { refresh } from "next/cache";
import { ORBIT_CALL, type Verdict } from "./verdict";

const VERDICTS: Verdict[] = ["GO", "HOLD", "RECALL"];
const ACTIONS = ["confirmed", "overridden"] as const;
const SOURCES = ["live", "replay"] as const;

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

// note: no auth; anyone with the URL can log a decision. Fine for a demo board, not for a plant.
export async function logDecision(form: FormData) {
  const verdict = String(form.get("verdict"));
  const action = String(form.get("action"));
  const source = String(form.get("source"));
  const missionId = form.get("missionId") ? String(form.get("missionId")) : null;
  let reasons: unknown;
  try {
    reasons = JSON.parse(String(form.get("reasons")));
  } catch {
    throw new Error("reasons must be JSON");
  }
  if (!VERDICTS.includes(verdict as Verdict)) throw new Error("bad verdict");
  if (!ACTIONS.includes(action as (typeof ACTIONS)[number])) throw new Error("bad action");
  if (!SOURCES.includes(source as (typeof SOURCES)[number])) throw new Error("bad source");
  if (!Array.isArray(reasons) || reasons.length > 20) throw new Error("bad reasons");
  if (missionId !== null && !/^M\d{3}$/.test(missionId)) throw new Error("bad mission id");

  // An override means the operator launches anyway, so no Orbit call is made.
  const orbitCall = action === "confirmed" ? ORBIT_CALL[verdict as Verdict] : null;
  await db()`INSERT INTO decisions (mission_id, verdict, reasons, source, operator_action, orbit_call)
             VALUES (${missionId}, ${verdict}, ${JSON.stringify(reasons)}, ${source}, ${action}, ${orbitCall})`;
  refresh();
}

export type Decision = {
  id: number;
  created_at: string;
  mission_id: string | null;
  verdict: Verdict;
  reasons: { text: string }[];
  source: string;
  operator_action: string;
  orbit_call: string | null;
};

export async function recentDecisions(): Promise<Decision[]> {
  const rows = await db()`SELECT id, created_at::text AS created_at, mission_id, verdict, reasons, source, operator_action, orbit_call
                          FROM decisions ORDER BY id DESC LIMIT 8`;
  return rows as Decision[];
}

// Clears replay decisions so every judge sees the replay from a clean log. Live decisions are untouched.
export async function resetReplay() {
  await db()`DELETE FROM decisions WHERE source = 'replay'`;
  refresh();
}
