import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Dog } from "lucide-react";
import { loadKit } from "@/lib/kit";
import { currentReviews } from "@/lib/reviews";
import { SidebarNav } from "@/components/sidebar-nav";
import { MobileNav } from "@/components/mobile-nav";
import { CommandPalette, type PaletteItem } from "@/components/command-palette";
import { SITE } from "@/lib/weather";

// Console shell: sidebar navigation plus the page. Every operator page lives under app/(console).
export default function ConsoleLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-4 lg:flex print:hidden">
        <Link href="/" className="mb-6 flex items-center gap-2.5 px-3 focus-visible:outline-2 focus-visible:outline-ring">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Dog aria-hidden className="size-4.5" />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold">SPOT Dispatch</span>
            <span className="block text-xs text-muted-foreground">{SITE.name.split(" (")[0]}</span>
          </span>
        </Link>
        <Palette />
        <Suspense fallback={<SidebarNav />}>
          <NavWithBadges />
        </Suspense>
        <div className="mt-auto space-y-1 rounded-lg bg-sidebar-accent p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Operator console</p>
          <p>Mission data: NextEra synthetic SPOT kit. Orbit link simulated.</p>
        </div>
      </aside>
      <div className="min-w-0 flex-1 pb-20 lg:pb-0">{children}</div>
      <MobileNav />
    </div>
  );
}

async function NavWithBadges() {
  await connection();
  const [kit, reviews] = await Promise.all([loadKit(), currentReviews()]);
  // Badge = anomalies flagged for operator review that nobody has triaged yet.
  const open = kit.anomalies.filter((a) => a.reviewRequired && !reviews[a.id]).length;
  return <SidebarNav badges={{ "/anomalies": open }} />;
}

async function Palette() {
  const kit = await loadKit();
  const loc = new Map(kit.locations.map((l) => [l.id, l.name]));
  const items: PaletteItem[] = [
    ...[
      ["Today", "/"],
      ["Live round", "/live"],
      ["Anomalies", "/anomalies"],
      ["Missions", "/missions"],
      ["Waypoints", "/waypoints"],
      ["Work orders", "/work-orders"],
      ["Insights", "/insights"],
      ["Storm drill", "/replay"],
      ["Floor check", "/floor-check"],
      ["Shift handoff", "/brief"],
    ].map(([label, href]) => ({ label, hint: "", href, group: "Page" })),
    ...kit.missions.map((m) => ({ label: m.id, hint: `${m.start.replace("T", " ").slice(5, 16)} · ${m.config} · ${m.status}`, href: `/missions/${m.id}`, group: "Mission" })),
    ...kit.locations.map((l) => ({ label: `${l.id} ${l.name}`, hint: `${l.zone.toLowerCase()} · floor ${l.floor}`, href: `/waypoints/${l.id}`, group: "Waypoint" })),
    ...kit.anomalies.map((a) => ({
      label: `${a.id} ${a.type.replaceAll("_", " ").toLowerCase()}`,
      hint: `${a.severity} · ${loc.get(a.locationId) ?? a.locationId} · ${a.missionId}`,
      href: `/missions/${a.missionId}`,
      group: "Anomaly",
    })),
  ];
  return <CommandPalette items={items} />;
}
