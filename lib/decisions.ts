"use server";

import { neon } from "@neondatabase/serverless";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { BRANCH_ID, connectionUri, createBranch, deleteBranch, getBranch, prune, type Branch } from "./neon-branch";
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
  const sql = source === "replay" ? await drillDb() : db();
  await sql`INSERT INTO decisions (mission_id, verdict, reasons, source, operator_action, orbit_call)
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

// Clears replay decisions so every judge sees the replay from a clean log, then gives the drill a fresh Neon branch. Live decisions are untouched.
export async function resetReplay() {
  await db()`DELETE FROM decisions WHERE source = 'replay'`;
  await startDrill();
}

// Storm drill sessions run on their own copy-on-write Neon branch of main. The cookie holds "branchId~createMs".
const DRILL_COOKIE = "drill_branch";
export type DrillStatus = { name: string; ms: number } | { off: "no-key" | "no-branch"; error?: string };

async function drillBranch(): Promise<(Branch & { ms: number }) | null> {
  const [id, ms] = ((await cookies()).get(DRILL_COOKIE)?.value ?? "").split("~");
  if (!process.env.NEON_API_KEY || !BRANCH_ID.test(id)) return null;
  try {
    const b = await getBranch(id);
    return b.name.startsWith("drill-") ? { ...b, ms: Number(ms) || 0 } : null;
  } catch {
    return null; // pruned by a newer drill, or the API is down: fall back to main
  }
}

// note: two Neon API calls per drill write (branch check + connection URI). Cache the URI per branch if writes get frequent.
async function drillDb() {
  const b = await drillBranch();
  if (!b) return db();
  try {
    return neon(await connectionUri(b.id));
  } catch {
    return db();
  }
}

export async function drillStatus(): Promise<DrillStatus> {
  if (!process.env.NEON_API_KEY) return { off: "no-key" };
  const b = await drillBranch();
  return b ? { name: b.name, ms: b.ms } : { off: "no-branch" };
}

/** Replaces this session's drill branch with a fresh copy of main. Keeps at most 3 drill branches on the project. */
export async function startDrill(): Promise<DrillStatus> {
  if (!process.env.NEON_API_KEY) return { off: "no-key" };
  const store = await cookies();
  try {
    const old = await drillBranch();
    if (old) await deleteBranch(old.id);
    await prune("drill-", 2);
    const b = await createBranch({ name: `drill-${Date.now().toString(36).slice(-6)}` });
    store.set(DRILL_COOKIE, `${b.id}~${b.ms}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 86400 });
    refresh();
    return { name: b.name, ms: b.ms };
  } catch (e) {
    store.delete(DRILL_COOKIE);
    refresh();
    return { off: "no-branch", error: e instanceof Error ? e.message : "Neon API failed" };
  }
}
