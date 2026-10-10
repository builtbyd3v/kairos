"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronRight, Clock } from "lucide-react";

const NAMES: Record<string, string> = {
  "": "Today",
  live: "Live round",
  anomalies: "Anomalies",
  missions: "Missions",
  waypoints: "Waypoints",
  "work-orders": "Work orders",
  insights: "Insights",
  brief: "Shift handoff",
  replay: "Storm drill",
  "floor-check": "Floor check",
};

// Top bar inside the app panel: breadcrumb, search, plant clock, alerts.
export function TopBar({ search, openAnomalies, site }: { search: ReactNode; openAnomalies: number; site: string }) {
  const parts = usePathname().split("/").filter(Boolean);
  const crumbs = [{ href: "/", label: NAMES[parts[0] ?? ""] ?? parts[0] }, ...(parts[1] ? [{ href: `/${parts[0]}/${parts[1]}`, label: parts[1] }] : [])];

  // Plant clock: rendered after mount so server and browser never disagree on the time.
  const [clock, setClock] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" }));
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-3 border-b border-white/[0.06] px-8 py-3 print:hidden">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
        <span className="text-muted-foreground">Dogwatch</span>
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
