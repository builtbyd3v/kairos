// Server-only. Who may write to production (main), and where everyone else's clicks go.
// The public link is a sandbox: a visitor's writes land on their own copy-on-write Neon branch, never on main.
// next/headers is imported lazily so node --test can load this file (plain Node cannot resolve the extensionless next/headers).
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { BRANCH_ID, connectionUri, createBranch, drillRoute, prune } from "./neon-branch.ts";

export const OPERATOR_COOKIE = "kairos_operator";
/** One branch per browser: the storm drill and every visitor write share it. Holds "branchId~createMs". */
export const BRANCH_COOKIE = "drill_branch";
/** Session branches kept at once. Neon Free allows 10 branches per project: main, eval-frozen, 3 snapshots, 2 as-of reviews, and these 3. */
export const KEEP_SESSION_BRANCHES = 3;

const sha = (s: string) => createHash("sha256").update(s).digest();

/** Constant-time check of a submitted operator key. No OPERATOR_KEY set means nobody is operator. */
export function keyMatches(given: unknown, expected = process.env.OPERATOR_KEY): boolean {
  if (!expected || typeof given !== "string" || !given || given.length > 200) return false;
  return timingSafeEqual(sha(given), sha(expected)); // equal-length digests, so the compare never leaks the key length
}

/** Cookie value that proves operator sign-in. Derived from the key, so rotating OPERATOR_KEY signs everyone out. */
export function operatorToken(key = process.env.OPERATOR_KEY): string | null {
  return key ? createHmac("sha256", key).update("kairos-operator-v1").digest("hex") : null;
}

export function tokenValid(token: unknown, key = process.env.OPERATOR_KEY): boolean {
  const t = operatorToken(key);
  return !!t && typeof token === "string" && token.length === t.length && timingSafeEqual(Buffer.from(token), Buffer.from(t));
}

// note: in-memory and per server instance, so a visitor spread across Vercel instances gets the ceiling on each. Move to Neon or Redis if abused.
const hits = new Map<string, number[]>();
/** Sliding-window limiter: true if this key has had fewer than max hits in the last windowMs. */
export function allow(key: string, max: number, windowMs = 60_000, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  const ok = recent.length < max;
  if (ok) recent.push(now);
  if (hits.size > 10_000) hits.clear(); // note: crude memory cap; a flood resets everyone's window
  hits.set(key, recent);
  return ok;
}

export type WriteTarget = { url: string; branch: string | null } | { refused: string };

function mainUrl() {
  const main = process.env.DATABASE_URL;
  if (!main) throw new Error("DATABASE_URL is not set");
  return main;
}

/**
 * Where one write goes. toMain (an operator's live write): main. Everything else: the session's own Neon branch.
 * branch() resolves or creates that branch; null, a throw, or anything pointing at main refuses the write. Never main.
 */
export async function routeWrite(toMain: boolean, branch: () => Promise<{ uri: string; name: string } | null>): Promise<WriteTarget> {
  const main = mainUrl();
  if (toMain) return { url: main, branch: null };
  let b: { uri: string; name: string } | null;
  try {
    b = await branch();
  } catch (e) {
    return { refused: `Not saved: your own Neon branch could not be created (${e instanceof Error ? e.message : "Neon API failed"}). Production is read-only for visitors.` };
  }
  if (!b || b.uri === main || !b.name.startsWith("drill-")) return { refused: "Not saved: Neon branching is unavailable right now. Production is read-only for visitors." };
  return { url: b.uri, branch: b.name };
}

// ---- Request-bound helpers (cookies, headers). Not unit tested; scripts/visitor-sandbox-check.mts runs them against real Neon.

const jar = async () => (await import("next/headers")).cookies();
async function ip() {
  const h = await (await import("next/headers")).headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

export async function isOperator(): Promise<boolean> {
  return tokenValid((await jar()).get(OPERATOR_COOKIE)?.value);
}

// note: caches a branch's connection URI for 20 s per instance, so page reads skip two Neon API calls. A branch pruned inside that window fails one read.
const routes = new Map<string, { uri: string; name: string; until: number }>();
async function liveBranch(id: string): Promise<{ uri: string; name: string } | null> {
  const hit = routes.get(id);
  if (hit && hit.until > Date.now()) return hit;
  const r = await drillRoute(id);
  if (!r.write || !r.branch) {
    routes.delete(id);
    return null;
  }
  const b = { uri: r.write, name: r.branch, until: Date.now() + 20_000 };
  routes.set(id, b);
  return b;
}

/** A fresh session branch of main: prunes the oldest beyond KEEP_SESSION_BRANCHES, clears copied drill rows, sets the cookie. */
export async function newSessionBranch() {
  // note: 10 new branches per IP and 30 overall per 10 min (operators exempt), so one client cannot churn every visitor's branch away.
  // Per IP, not per cookie: clearing cookies must not reset it. A whole venue behind one NAT shares the 10.
  if (!(await isOperator()) && (!allow(`create:${await ip()}`, 10, 600_000) || !allow("create:all", 30, 600_000)))
    throw new Error("too many new branches, try again in a few minutes");
  const pruned = await prune("drill-", KEEP_SESSION_BRANCHES - 1);
  if (pruned.length) routes.clear();
  const b = await createBranch({ name: `drill-${Date.now().toString(36).slice(-6)}` });
  const uri = await connectionUri(b.id);
  // The copy may carry old replay rows from main; clear them on the branch only, so the drill starts from a clean log.
  await neon(uri)`DELETE FROM decisions WHERE source = 'replay'`;
  (await jar()).set(BRANCH_COOKIE, `${b.id}~${b.ms}`, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 86400 });
  return { ...b, uri };
}

/** This session's branch id and copy time from the cookie, or null. */
export async function sessionCookie(): Promise<{ id: string; ms: number } | null> {
  const [id, ms] = ((await jar()).get(BRANCH_COOKIE)?.value ?? "").split("~");
  return BRANCH_ID.test(id) ? { id, ms: Number(ms) || 0 } : null;
}

/** This session's branch, if it still exists. create: make one on the first write. */
export async function sessionBranch(create = false): Promise<{ uri: string; name: string } | null> {
  if (!process.env.NEON_API_KEY) return null;
  const c = await sessionCookie();
  const b = c && (await liveBranch(c.id));
  if (b || !create) return b;
  return newSessionBranch();
}

/** SQL for one write plus where it landed. live: an operator's write goes to main; drill (replay) writes always go to the branch. */
export async function writeDb(live: boolean) {
  mainUrl(); // fail before any cookie read when the database is not configured
  const operator = await isOperator();
  // note: 30 writes per minute per visitor (branch cookie, else IP), in memory (see allow). Operators are not limited.
  if (!operator && !allow(`write:${(await sessionCookie())?.id ?? await ip()}`, 30)) return { refused: "Not saved: 30 clicks per minute is the visitor limit. Wait a moment." };
  const t = await routeWrite(operator && live, () => sessionBranch(true));
  return "refused" in t ? t : { sql: neon(t.url), branch: t.branch };
}

type Rows = Awaited<ReturnType<ReturnType<typeof neon>>>;
/** Tagged-template SQL for page reads. */
export type ReadSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Rows>;

/** SQL for page reads: an operator reads main; a visitor reads their own branch (so they see their clicks), or main before their first write. */
export async function readDb(): Promise<ReadSql> {
  const main = neon(mainUrl());
  if (await isOperator()) return (s, ...v) => main(s, ...v);
  const b = await sessionBranch().catch(() => null);
  if (!b) return (s, ...v) => main(s, ...v);
  const branch = neon(b.uri);
  // A visitor's branch can be pruned by another visitor's first write while its route is still cached (see liveBranch).
  // Then the read falls back to main instead of crashing the page; the next write makes a fresh branch.
  return (s, ...v) =>
    branch(s, ...v).catch(() => {
      routes.clear();
      return main(s, ...v);
    });
}

export type Sandbox = { mode: "operator" } | { mode: "visitor"; branch: string | null; branching: boolean };
export async function sandboxStatus(): Promise<Sandbox> {
  if (await isOperator()) return { mode: "operator" };
  const b = await sessionBranch().catch(() => null);
  return { mode: "visitor", branch: b?.name ?? null, branching: !!process.env.NEON_API_KEY };
}

/** Operator sign-in form action. Wrong or missing key: nothing changes. 5 tries per minute per IP. */
export async function operatorSignIn(form: FormData) {
  "use server";
  if (!allow(`key:${await ip()}`, 5)) return;
  if (!keyMatches(form.get("key"))) return;
  (await jar()).set(OPERATOR_COOKIE, operatorToken()!, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 12 * 3600 });
}

export async function operatorSignOut() {
  "use server";
  (await jar()).delete(OPERATOR_COOKIE);
}
