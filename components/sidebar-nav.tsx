"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CloudLightning, Droplets, History, House, Radio, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const GROUPS = [
  {
    label: "Operate",
    items: [
      { href: "/", label: "Launch", Icon: House },
      { href: "/live", label: "Live round", Icon: Radio },
    ],
  },
  // note: Orbit already covers anomalies, missions, waypoints, work orders, insights and shift handoff. Those pages stay reachable by URL, off the nav.
  {
    label: "Prove it",
    items: [
      { href: "/replay", label: "Storm drill", Icon: CloudLightning },
      { href: "/floor-check", label: "Water model", Icon: Droplets },
    ],
  },
  {
    label: "Records",
    items: [
      { href: "/evidence", label: "Evidence", Icon: ShieldCheck },
      { href: "/review", label: "Incident review", Icon: History },
    ],
  },
];

export function SidebarNav({ badges = {} }: { badges?: Record<string, number> }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <nav aria-label="Main" className="space-y-6">
      {GROUPS.map((g) => (
        <div key={g.label}>
          <p className="label-caps px-3 pb-1.5 text-helper">{g.label}</p>
          <ul className="space-y-0.5">
            {g.items.map(({ href, label, Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active(href) ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-[background-color,color,translate] duration-150 ease-out hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring motion-safe:hover:translate-x-0.5",
                    active(href) && "bg-sidebar-accent font-medium text-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] ring-1 ring-white/[0.06]",
                  )}
                >
                  <Icon aria-hidden className={cn("size-4", active(href) && "text-primary")} />
                  {label}
                  {badges[href] ? (
                    <span className="ml-auto rounded-full bg-recall px-1.5 font-mono text-[11px] font-medium text-background tabular-nums">{badges[href]}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
