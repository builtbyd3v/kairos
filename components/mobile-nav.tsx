"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CloudLightning, Droplets, House, Radio, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Launch", Icon: House },
  { href: "/live", label: "Live", Icon: Radio },
  { href: "/evidence", label: "Evidence", Icon: ShieldCheck },
  { href: "/floor-check", label: "Water", Icon: Droplets },
  { href: "/replay", label: "Drill", Icon: CloudLightning },
];

// Phone layout: the sidebar becomes a bottom tab bar.
export function MobileNav() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden">
      {TABS.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={active(href) ? "page" : undefined}
          className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px] text-muted-foreground", active(href) && "text-primary")}
        >
          <Icon aria-hidden className="size-5" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
