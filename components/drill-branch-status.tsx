import { Suspense } from "react";
import { GitBranch } from "lucide-react";
import { drillStatus } from "@/lib/decisions";
import { FreshCopyButton } from "@/components/fresh-copy-button";

/** One line under the storm drill: which Neon branch the drill writes to, plus a Fresh copy button. Mount anywhere; it suspends on its own. */
export function DrillBranchStatus() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Checking the drill&apos;s Neon branch…</p>}>
      <Line />
    </Suspense>
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
