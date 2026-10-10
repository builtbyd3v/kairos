import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

// The demo story, in order. Each step causes the next: the storm holds launch, leaves puddles, and every call is logged.
const STEPS = [
  { href: "/", label: "Can Spot go out?" },
  { href: "/live", label: "Puddle on the route" },
  { href: "/replay", label: "Storm mid-round" },
  { href: "/evidence", label: "Every call logged" },
];

/** Slim step bar under the page header: where you are in the demo story, and the next step. */
export function StoryBar({ step }: { step: 1 | 2 | 3 | 4 }) {
  const next = STEPS[step];
  return (
    <nav aria-label="Demo story" className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-2 px-8 pt-1 pb-2">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs">
        {STEPS.map((s, i) => (
          <li key={s.href}>
            <Link
              href={s.href}
              aria-current={i + 1 === step ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ring-1 transition-colors",
                i + 1 === step ? "bg-primary/15 text-primary ring-primary/40" : i + 1 < step ? "text-muted-foreground ring-white/10" : "text-helper ring-white/[0.06] hover:text-foreground",
              )}
            >
              <span className="font-mono tabular-nums">{i + 1}</span>
              {s.label}
            </Link>
          </li>
        ))}
      </ol>
      {next && (
        <Link href={next.href} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Next: {next.label} <ArrowRight aria-hidden className="size-4" />
        </Link>
      )}
    </nav>
  );
}
