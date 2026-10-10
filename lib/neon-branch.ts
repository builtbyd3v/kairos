// Server-only: holds NEON_API_KEY. Never import from a client component.
// Neon API v2: copy-on-write branches of main, for storm drills and as-of reviews.
const API = "https://console.neon.tech/api/v2";

export type Branch = { id: string; name: string; default: boolean; created_at: string };

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = process.env.NEON_API_KEY;
  const project = process.env.NEON_PROJECT_ID;
  if (!key || !project) throw new Error("NEON_API_KEY or NEON_PROJECT_ID is not set");
  const res = await fetch(`${API}/projects/${project}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "Content-Type": "application/json" },
    // A signal also opts out of Next's per-render GET memoization, which would freeze the status poll below.
    signal: AbortSignal.timeout(15000),
  });
  // Only the status goes into the error; the body can echo request details.
  if (!res.ok) throw new Error(`Neon API ${init.method ?? "GET"} ${path.split("?")[0]} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const BRANCH_ID = /^br-[a-z0-9-]{1,60}$/;

export async function getBranch(id: string): Promise<Branch> {
  return (await api<{ branch: Branch }>(`/branches/${id}`)).branch;
}

/** Creates a branch of main (now, or at parentTimestamp) with its own read_write compute. Resolves once Neon reports it ready. */
export async function createBranch({ name, parentTimestamp }: { name: string; parentTimestamp?: string }) {
  const t0 = Date.now();
  const res = await api<{ branch: Branch; operations: { id: string }[] }>("/branches", {
    method: "POST",
    body: JSON.stringify({ branch: { name, ...(parentTimestamp && { parent_timestamp: parentTimestamp }) }, endpoints: [{ type: "read_write" }] }),
  });
  // note: polls every 250 ms for up to 30 s; Neon suggests backoff, but a create finishes in about 2 s here.
  try {
    for (const op of res.operations) {
      for (let status = ""; status !== "finished" && status !== "skipped"; ) {
        if (Date.now() - t0 > 30000) throw new Error("Neon branch was not ready after 30 s");
        if (["failed", "error", "cancelled"].includes(status)) throw new Error(`Neon operation ${status}`);
        await new Promise((r) => setTimeout(r, 250));
        status = (await api<{ operation: { status: string } }>(`/operations/${op.id}`)).operation.status;
      }
    }
  } catch (e) {
    await api(`/branches/${res.branch.id}`, { method: "DELETE" }).catch(() => {}); // never leave a half-made branch behind
    throw e;
  }
  return { id: res.branch.id, name: res.branch.name, ms: Date.now() - t0 };
}

export async function connectionUri(branchId: string): Promise<string> {
  const q = new URLSearchParams({ branch_id: branchId, database_name: process.env.PGDATABASE ?? "neondb", role_name: process.env.PGUSER ?? "neondb_owner" });
  return (await api<{ uri: string }>(`/connection_uri?${q}`)).uri;
}

/**
 * Where a storm drill session reads and writes. A missing, pruned or unreachable drill branch (or a Neon API outage)
 * falls back to main for reads and turns drill writes off: write is null. Drill data never lands on main.
 */
export async function drillRoute(branchId: string | undefined): Promise<{ read: string; write: string | null; branch: string | null }> {
  const main = process.env.DATABASE_URL;
  if (!main) throw new Error("DATABASE_URL is not set");
  const off = { read: main, write: null, branch: null };
  if (!process.env.NEON_API_KEY || !branchId || !BRANCH_ID.test(branchId)) return off;
  try {
    const b = await getBranch(branchId);
    if (b.default || !b.name.startsWith("drill-")) return off;
    const uri = await connectionUri(b.id);
    return { read: uri, write: uri, branch: b.name };
  } catch {
    return off;
  }
}

/** Deletes a branch. Refuses the default branch and anything named main. */
export async function deleteBranch(id: string) {
  const b = await getBranch(id);
  if (b.default || b.name === "main") throw new Error("Refusing to delete the main branch");
  await api(`/branches/${id}`, { method: "DELETE" });
}

export async function listBranches(): Promise<Branch[]> {
  return (await api<{ branches: Branch[] }>("/branches")).branches;
}

/** Keeps the newest `keep` branches whose name starts with prefix and deletes the rest. */
export async function prune(prefix: string, keep: number) {
  if (!prefix) throw new Error("prune needs a prefix");
  const old = (await listBranches())
    .filter((b) => b.name.startsWith(prefix) && !b.default)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(keep);
  await Promise.all(old.map((b) => deleteBranch(b.id)));
  return old.map((b) => b.name);
}
