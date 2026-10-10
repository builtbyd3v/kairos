"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronRight, Clock } from "lucide-react";
import { setScenario } from "@/lib/scenario-actions";
import { cn } from "@/lib/utils";

const NAMES: Record<string, string> = {
  "": "Launch",
  evidence: "Evidence",
  live: "Live round",
  anomalies: "Anomalies",
  missions: "Missions",
  waypoints: "Waypoints",
  "work-orders": "Work orders",
  insights: "Insights",
  brief: "Shift handoff",
  replay: "Storm drill",
  "floor-check": "Water model",
};

// Top bar inside the app panel: breadcrumb, search, plant clock, alerts.
export function TopBar({ search, openAnomalies, site, recordedAt }: { search: ReactNode; openAnomalies: number; site: string; recordedAt?: string }) {
  const parts = usePathname().split("/").filter(Boolean);
  const crumbs = [{ href: "/", label: NAMES[parts[0] ?? ""] ?? parts[0] }, ...(parts[1] ? [{ href: `/${parts[0]}/${parts[1]}`, label: parts[1] }] : [])];

  // Plant clock: rendered after mount so server and browser never disagree on the time.
  const [clock, setClock] = useState<string | null>(null);
  useEffect(() => {
    // Recorded scenario: the clock stops at the moment the storm was captured, like every rule on the page.
    const tick = () => setClock(new Date(recordedAt ?? Date.now()).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" }));
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [recordedAt]);

  return (
    <div className="flex items-center gap-3 border-b border-white/[0.06] px-8 py-3 print:hidden">
      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-sm sm:flex">
        <span className="text-muted-foreground">Kairos</span>
        {crumbs.map((c, i) => (
          <span key={c.href} className="flex items-center gap-1.5">
            <ChevronRight aria-hidden className="size-3.5 text-helper" />
            {i === crumbs.length - 1 ? (
              <span aria-current="page" className="truncate font-medium text-primary">
                {c.label}
              </span>
            ) : (
              <Link href={c.href} className="text-muted-foreground hover:text-foreground">
                {c.label}
              </Link>
            )}
          </span>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <div className="hidden w-56 md:block">{search}</div>
        <form action={setScenario} className="flex rounded-lg bg-card p-0.5 font-mono text-[11px] font-semibold tracking-wide ring-1 ring-white/[0.06]" title="Recorded: a real St. Lucie storm captured Sat 5:56 PM, replayed. Live: weather right now. Robot data, camera frames and Orbit calls are demo data in both.">
          {(["recorded", "live"] as const).map((v) => {
            const on = (v === "recorded") === Boolean(recordedAt);
            return (
              <button key={v} name="scenario" value={v} aria-pressed={on} className={cn("rounded-md px-2 py-1 transition-colors", on ? (v === "live" ? "bg-go/20 text-go" : "bg-hold/20 text-hold") : "text-muted-foreground hover:text-foreground")}>
                {v === "recorded" ? (
                  <>
                    <span className="sm:hidden">STORM</span>
                    <span className="hidden sm:inline">RECORDED STORM</span>
                  </>
                ) : (
                  "LIVE"
                )}
              </button>
            );
          })}
        </form>
        <span className="hidden items-center gap-1.5 rounded-lg bg-card px-3 py-2 text-xs text-muted-foreground ring-1 ring-white/[0.06] sm:flex">
          <Clock aria-hidden className="size-3.5" />
          {site} · <span className="font-mono tabular-nums">{clock ?? "--"}</span> ET
        </span>
        <Link
          href="/anomalies"
          aria-label={`${openAnomalies} anomalies need you`}
          className="relative grid size-9 place-items-center rounded-lg bg-card text-muted-foreground ring-1 ring-white/[0.06] transition-colors hover:text-foreground hover:ring-white/[0.12] focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Bell aria-hidden className="size-4" />
          {openAnomalies > 0 && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-recall ring-2 ring-card" />}
        </Link>
        <span aria-label="Signed in as operator" className="grid size-9 place-items-center rounded-lg bg-secondary font-mono text-xs font-semibold ring-1 ring-white/[0.08]">
          OP
        </span>
      </div>
    </div>
  );
}
