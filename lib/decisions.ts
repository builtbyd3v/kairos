"use server";

import { neon } from "@neondatabase/serverless";
import { refresh } from "next/cache";
import { deleteBranch } from "./neon-branch";
import { newSessionBranch, readDb, sessionBranch, sessionCookie, writeDb } from "./operator";
import { ORBIT_CALL, type Verdict } from "./verdict";

const VERDICTS: Verdict[] = ["GO", "HOLD", "RECALL"];
const ACTIONS = ["confirmed", "overridden"] as const;
const SOURCES = ["live", "replay"] as const;

// Operator (OPERATOR_KEY cookie) live decisions go to main. Visitors and every drill decision go to the session's own Neon branch.
// A refused write saves nothing; it never falls back to main.
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
  const row = [missionId, verdict, JSON.stringify(reasons), source, action, orbitCall];
  const target = await writeDb(source === "live");
  // note: the board's forms ignore return values, so a refusal shows only in the sandbox status line. Never main.
  if ("refused" in target) return console.error(`decision not saved: ${target.refused}`);
  if (source === "replay") {
    await target.sql.query("INSERT INTO decisions (mission_id, verdict, reasons, source, operator_action, orbit_call) VALUES ($1, $2, $3, $4, $5, $6)", row);
  } else {
    // The receipt copy outlives Neon's 6 h history window and a reseed, so the incident review can still show this decision later.
    await target.sql.query(
      `WITH d AS (INSERT INTO decisions (mission_id, verdict, reasons, source, operator_action, orbit_call) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *)
       INSERT INTO receipts (kind, ref, at, body) SELECT 'decision', id::text, created_at, to_jsonb(d) FROM d`,
      row,
    );
  }
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
  // note: a separate const, because the production build drops the parens in (await readDb())`...` and tags the promise.
  const sql = await readDb();
  const rows = await sql`SELECT id, created_at::text AS created_at, mission_id, verdict, reasons, source, operator_action, orbit_call
                                      FROM decisions WHERE source = 'live' ORDER BY id DESC LIMIT 8`;
  return rows as Decision[];
}

// Gives the drill a fresh Neon branch, so every judge sees the replay from a clean log. Main is never touched.
export async function resetReplay() {
  await startDrill();
}

// Storm drills run on the session's own copy-on-write Neon branch of main (lib/operator.ts), the same branch visitor writes use.
export type DrillStatus = { name: string; ms: number; saved?: number } | { off: "no-key" | "no-branch"; error?: string };

export async function drillStatus(): Promise<DrillStatus> {
  if (!process.env.NEON_API_KEY) return { off: "no-key" };
  const [c, b] = await Promise.all([sessionCookie(), sessionBranch().catch(() => null)]);
  if (!c || !b) return { off: "no-branch" };
  // Proof the drill click landed: count this branch's own drill decisions (the branch starts with none, see newSessionBranch).
  const [{ n }] = (await neon(b.uri)`SELECT count(*)::int AS n FROM decisions WHERE source = 'replay'`) as { n: number }[];
  return { name: b.name, ms: c.ms, saved: n };
}

/** Replaces this session's branch with a fresh copy of main. Keeps at most KEEP_SESSION_BRANCHES session branches on the project. */
export async function startDrill(): Promise<DrillStatus> {
  if (!process.env.NEON_API_KEY) return { off: "no-key" };
  try {
    const old = await sessionCookie();
    if (old) await deleteBranch(old.id).catch(() => {}); // already pruned is fine
    const b = await newSessionBranch();
    refresh();
    return { name: b.name, ms: b.ms };
  } catch (e) {
    refresh();
    return { off: "no-branch", error: e instanceof Error ? e.message : "Neon API failed" };
  }
}
