"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CloudLightning, Droplets, House, Radio, ListChecks, Route } from "lucide-react";
import { cn } from "@/lib/utils";

const GROUPS = [
  {
    label: "Operate",
    items: [
      { href: "/", label: "Today", Icon: House },
      { href: "/live", label: "Live round", Icon: Radio },
      { href: "/anomalies", label: "Anomalies", Icon: ListChecks },
      { href: "/missions", label: "Missions", Icon: Route },
    ],
  },
  { label: "Analyze", items: [{ href: "/insights", label: "Insights", Icon: BarChart3 }] },
  {
    label: "Tools",
    items: [
      { href: "/replay", label: "Storm drill", Icon: CloudLightning },
      { href: "/floor-check", label: "Floor check", Icon: Droplets },
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
          <p className="px-3 pb-1.5 text-[11px] font-medium tracking-wider text-helper uppercase">{g.label}</p>
          <ul className="space-y-0.5">
            {g.items.map(({ href, label, Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active(href) ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                    active(href) && "bg-sidebar-accent font-medium text-foreground",
                  )}
                >
                  <Icon aria-hidden className={cn("size-4", active(href) && "text-primary")} />
                  {label}
                  {badges[href] ? (
                    <span className="ml-auto rounded-full bg-recall/15 px-1.5 text-xs font-medium text-recall tabular-nums">{badges[href]}</span>
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
