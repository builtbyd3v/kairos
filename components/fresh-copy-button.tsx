"use client";

import { useEffect, useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { startDrill } from "@/lib/decisions";
import { Button } from "@/components/ui/button";

export function FreshCopyButton({ auto }: { auto: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const run = () =>
    start(async () => {
      const s = await startDrill();
      setError("error" in s ? s.error : undefined);
    });
  // Creating the Neon branch is the outside system this effect syncs with. note: React dev mode runs it twice; prune keeps the extra branch harmless.
  useEffect(() => {
    if (auto) run();
  }, [auto]);
  return (
    <>
      <Button variant="outline" size="sm" onClick={run} disabled={pending}>
        <RotateCcw aria-hidden /> {pending ? "Copying main…" : "Fresh copy"}
      </Button>
      {error && <span className="text-xs text-recall">Branching failed ({error}). Drill decisions are not saved until a branch is ready.</span>}
    </>
  );
}
