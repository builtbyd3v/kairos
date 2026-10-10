import type { CSSProperties } from "react";
import Link from "next/link";
import type { analyze } from "@/lib/kit";
import { ROUND_HOURS_ET } from "@/lib/forecast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Rows = ReturnType<typeof analyze>["missionRows"];

/**
 * Rounds per kit day as a waffle grid: one square per scheduled slot (02:00, 10:00, 18:00).
 * Blue = clean round, red = needs attention, faint = no kit round in that slot.
 */
export function RoundsChart({ rows }: { rows: Rows }) {
  const days = [...new Set(rows.map((r) => r.start.slice(0, 10)))].sort();
  const slots = [...ROUND_HOURS_ET].reverse(); // top row = latest slot, so the grid reads bottom-up like a bar
  const at = (day: string, hour: number) => rows.find((r) => r.start.startsWith(day) && Number(r.start.slice(11, 13)) === hour);
  const attention = rows.filter((r) => r.truth !== "CLEAN").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rounds by day</CardTitle>
        <CardDescription>
          {days[0]?.slice(5)} to {days.at(-1)?.slice(5)} (kit time)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="panel-inset space-y-3 p-4">
          <p className="flex items-baseline gap-2">
            <span className="font-mono text-3xl font-medium tabular-nums">{rows.length}</span>
            <span className="text-sm text-muted-foreground">rounds</span>
            <span className="ml-auto font-mono text-xs text-recall tabular-nums">{attention} need attention</span>
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-[2px] bg-primary" /> Clean
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-[2px] bg-recall" /> Failed or serious anomaly
            </span>
          </p>
          <div className="grid grid-cols-[1.5rem_1fr] gap-x-2">
            <ol aria-hidden className="grid grid-rows-3 gap-1 font-mono text-[10px] text-helper">
              {slots.map((h) => (
                <li key={h} className="flex items-center">
                  {String(h).padStart(2, "0")}
                </li>
              ))}
            </ol>
            <ol aria-label="Rounds by kit day and slot" className="grid auto-cols-fr grid-flow-col gap-1">
              {days.map((day, i) => (
                // note: per-column delay is data-driven, so it rides a CSS var in style rather than a static class.
                <li key={day} className="grid gap-1" style={{ "--rise-delay": `${i * 40}ms` } as CSSProperties}>
                  {slots.map((h) => {
                    const r = at(day, h);
                    const text = r ? `${r.id}, ${day.slice(5)} ${String(h).padStart(2, "0")}:00: ${r.truth === "CLEAN" ? "clean" : `needs attention, ${r.failed} failed, ${r.serious} serious`}` : `${day.slice(5)} ${String(h).padStart(2, "0")}:00: no kit round`;
                    const cell = cn(
                      "block aspect-square w-full rounded-[3px]",
                      r ? (r.truth === "CLEAN" ? "bg-primary/85" : "bg-recall") : "bg-white/[0.04] ring-1 ring-white/[0.03] ring-inset",
                    );
                    return r ? (
                      <Link
                        key={h}
                        href={`/missions/${r.id}`}
                        aria-label={text}
                        className="group/sq relative block animate-grow-y rounded-[3px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                      >
                        <span className={cn(cell, "transition-[filter] group-hover/sq:brightness-125")} />
                        <span
                          role="presentation"
                          className={cn(
                            "pointer-events-none absolute bottom-full z-10 mb-1.5 rounded-md bg-popover px-2 py-1 font-mono text-[11px] whitespace-nowrap text-popover-foreground opacity-0 shadow-lg ring-1 ring-border transition-opacity group-hover/sq:opacity-100 group-focus-visible/sq:opacity-100",
                            // Edge columns anchor the popover inward so the card edge never clips it.
                            i < 3 ? "left-0" : i > days.length - 4 ? "right-0" : "left-1/2 -translate-x-1/2",
                          )}
                        >
                          {r.id} · {r.truth === "CLEAN" ? "clean" : `${r.failed} failed · ${r.serious} serious`}
                        </span>
                      </Link>
                    ) : (
                      <span key={h} role="img" aria-label={text} title={text} className={cell} />
                    );
                  })}
                </li>
              ))}
            </ol>
            <span />
            <ol aria-hidden className="mt-1.5 grid auto-cols-fr grid-flow-col gap-1 border-t border-dotted border-border pt-1.5 text-center font-mono text-[10px] text-helper">
              {days.map((d) => (
                <li key={d}>{Number(d.slice(8))}</li>
              ))}
            </ol>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
