import { CircleCheckBig, Pause, TriangleAlert } from "lucide-react";
import type { Reason, Verdict } from "@/lib/verdict";
import { cn } from "@/lib/utils";

// Status is always color + icon + word, never color alone (WCAG 1.4.1).
export const VERDICT_UI: Record<Verdict, { Icon: typeof Pause; text: string; ring: string; fill: string }> = {
  GO: { Icon: CircleCheckBig, text: "text-go", ring: "ring-go/50", fill: "bg-go/10" },
  HOLD: { Icon: Pause, text: "text-hold", ring: "ring-hold/50", fill: "bg-hold/10" },
  RECALL: { Icon: TriangleAlert, text: "text-recall", ring: "ring-recall/60", fill: "bg-recall/15" },
};

export function VerdictBlock({ verdict, caption }: { verdict: Verdict; caption?: string }) {
  const ui = VERDICT_UI[verdict];
  return (
    // key on the verdict so the 240 ms flip plays only when it changes
    <div key={verdict} role="status" aria-live="polite" className={cn("animate-verdict rounded px-5 py-4 ring-1", ui.fill, ui.ring)}>
      <div className={cn("flex items-center gap-3 text-4xl font-semibold tracking-tight", ui.text)}>
        <ui.Icon aria-hidden className="size-9" strokeWidth={2.25} />
        {verdict}
      </div>
      {caption && <p className="mt-1 text-sm text-muted-foreground">{caption}</p>}
    </div>
  );
}

export function VerdictChip({ verdict, className }: { verdict: Verdict; className?: string }) {
  const ui = VERDICT_UI[verdict];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ring-1", ui.fill, ui.ring, ui.text, className)}>
      <ui.Icon aria-hidden className="size-3" />
      {verdict}
    </span>
  );
}

export function ReasonList({ reasons }: { reasons: Reason[] }) {
  if (reasons.length === 0) return <p className="text-sm text-muted-foreground">No weather or health limits are close for this round.</p>;
  return (
    <ul className="space-y-2">
      {reasons.map((r) => (
        <li key={r.text} className="flex items-start gap-2 text-sm">
          <VerdictChip verdict={r.verdict} className="mt-px" />
          <span>
            {r.text}
            <span className="block text-xs text-helper">{r.source}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export const SEVERITY_UI: Record<string, string> = {
  CRITICAL: "bg-recall/20 text-recall ring-recall/50",
  HIGH: "bg-recall/10 text-[#ff8389] ring-recall/30",
  MEDIUM: "bg-hold/10 text-hold ring-hold/30",
  LOW: "bg-secondary text-muted-foreground ring-border",
};

export const TRUTH_UI: Record<string, { text: string; label: string }> = {
  CLEAN: { text: "text-go", label: "Clean" },
  DEGRADED: { text: "text-hold", label: "Degraded" },
  "NEEDS REVIEW": { text: "text-recall", label: "Needs review" },
  FAILED: { text: "text-recall", label: "Failed" },
};
