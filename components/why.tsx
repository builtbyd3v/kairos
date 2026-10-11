import type { ReactNode } from "react";
import { Info } from "lucide-react";

/** Sources, assumptions and caveats, one click away instead of on the card. Native <details>, no JS. */
export function Why({ children, label = "Sources" }: { children: ReactNode; label?: string }) {
  return (
    <details className="text-xs text-helper">
      <summary className="inline-flex min-h-6 cursor-pointer list-none items-center gap-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        <Info aria-hidden className="size-3.5" />
        {label}
      </summary>
      <div className="mt-2 space-y-1 leading-relaxed">{children}</div>
    </details>
  );
}
