import { Suspense } from "react";
import { GitBranch, ShieldCheck } from "lucide-react";
import { drillStatus } from "@/lib/decisions";
import { operatorSignIn, operatorSignOut, sandboxStatus } from "@/lib/operator";
import { FreshCopyButton } from "@/components/fresh-copy-button";
import { Button } from "@/components/ui/button";

/** One line under the storm drill: which Neon branch the drill writes to, plus a Fresh copy button. Mount anywhere; it suspends on its own. */
export function DrillBranchStatus() {
  return (
    <div className="space-y-2">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Checking the drill&apos;s Neon branch…</p>}>
        <Line />
      </Suspense>
      <SandboxStatus />
    </div>
  );
}

async function Line() {
  const s = await drillStatus();
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <GitBranch aria-hidden className="size-4 text-muted-foreground" />
      {"name" in s ? (
        <p>
          Running on Neon branch <span className="font-mono">{s.name}</span>, copied from main in <span className="font-mono">{s.ms} ms</span> ·{" "}
          <span className="font-mono tabular-nums">{s.saved ?? 0}</span> drill {s.saved === 1 ? "decision" : "decisions"} saved on this branch, none on main
        </p>
      ) : (
        <p className="text-muted-foreground">
          {s.off === "no-key" ? "Neon branching is off (no API key). Drill decisions are not saved, and never go to main." : "No drill branch yet. Drill decisions are not saved until one is ready, and never go to main."}
        </p>
      )}
      {/* Auto-start once when there is no branch yet, so a judge's first Confirm already lands on a branch. */}
      {("name" in s || s.off !== "no-key") && <FreshCopyButton auto={!("name" in s)} />}
    </div>
  );
}

/** Where this visitor's clicks go: their own Neon branch, or production for a signed-in operator. Suspends on its own. */
export function SandboxStatus() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Checking where your clicks are saved…</p>}>
      <Sandbox />
    </Suspense>
  );
}

async function Sandbox() {
  const s = await sandboxStatus();
  if (s.mode === "operator")
    return (
      <form action={operatorSignOut} className="flex flex-wrap items-center gap-3 text-sm">
        <ShieldCheck aria-hidden className="size-4 text-hold" />
        <p>Operator: writing to production (Neon main).</p>
        <Button size="sm" variant="outline" type="submit">
          Sign out
        </Button>
      </form>
    );
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <GitBranch aria-hidden className="size-4 text-muted-foreground" />
      <p className="text-muted-foreground">
        {s.branch ? (
          <>
            Your clicks are saved on your own Neon branch <span className="font-mono text-foreground">{s.branch}</span>; production is unchanged.
          </>
        ) : s.branching ? (
          "Your first click creates your own Neon branch and is saved there; production is unchanged."
        ) : (
          "Production is read-only for visitors, and Neon branching is off, so your clicks are not saved."
        )}
      </p>
      <details className="text-xs">
        <summary className="cursor-pointer text-helper">Operator sign-in</summary>
        <form action={operatorSignIn} className="mt-2 flex items-center gap-2">
          <label htmlFor="operator-key" className="sr-only">
            Operator key
          </label>
          <input id="operator-key" name="key" type="password" required maxLength={200} autoComplete="current-password" placeholder="Operator key" className="h-8 rounded-lg bg-secondary px-2 font-mono text-sm ring-1 ring-border" />
          <Button size="sm" type="submit">
            Sign in
          </Button>
        </form>
      </details>
    </div>
  );
}
