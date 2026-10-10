import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Dog } from "lucide-react";
import { loadKit } from "@/lib/kit";
import { currentReviews } from "@/lib/reviews";
import { SidebarNav } from "@/components/sidebar-nav";
import { MobileNav } from "@/components/mobile-nav";
import { CommandPalette, type PaletteItem } from "@/components/command-palette";
import { TopBar } from "@/components/top-bar";
import { SITE } from "@/lib/weather";

// Console shell: sidebar navigation plus the page. Every operator page lives under app/(console).
export default function ConsoleLayout({ children }: LayoutProps<"/">) {
  return (
    // The whole app floats on a darker backdrop as one framed window (sidebar + panel), like a desktop app.
    <div className="min-h-screen bg-backdrop lg:p-3 print:bg-white print:p-0">
      <div className="flex min-h-screen lg:min-h-[calc(100vh-1.5rem)] lg:rounded-2xl lg:bg-sidebar lg:shadow-[0_32px_80px_-24px_rgb(0_0_0/0.9)] lg:ring-1 lg:ring-white/[0.07] print:bg-white print:shadow-none print:ring-0">
        <aside className="sticky top-3 hidden h-[calc(100vh-1.5rem)] w-60 shrink-0 flex-col px-3 py-4 lg:flex print:hidden">
          <Link href="/" className="mb-6 flex items-center gap-2.5 rounded-xl bg-card p-2.5 ring-1 ring-white/[0.06] focus-visible:outline-2 focus-visible:outline-ring">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]">
              <Dog aria-hidden className="size-4.5" />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold">Dogwatch</span>
              <span className="block text-xs text-muted-foreground">{SITE.name.split(" (")[0]}</span>
            </span>
          </Link>
          <Suspense fallback={<SidebarNav />}>
            <NavWithBadges />
          </Suspense>
          <div className="mt-auto space-y-1 rounded-xl bg-card p-3 text-xs text-muted-foreground ring-1 ring-white/[0.06]">
            <p className="font-medium text-foreground">Operator console</p>
            <p>Mission data: NextEra synthetic SPOT kit. Orbit link simulated.</p>
          </div>
        </aside>
        <div className="min-w-0 flex-1 bg-background pb-20 lg:rounded-r-2xl lg:border-l lg:border-white/[0.06] lg:pb-0 print:border-0 print:bg-white">
          <Suspense fallback={<TopBar search={<Palette />} openAnomalies={0} site={SITE.name.split(",")[0]} />}>
            <Top />
          </Suspense>
          {children}
        </div>
      </div>
      <MobileNav />
    </div>
  );
}

async function Top() {
  await connection();
  const [kit, reviews] = await Promise.all([loadKit(), currentReviews()]);
  const open = kit.anomalies.filter((a) => a.reviewRequired && !reviews[a.id]).length;
  return <TopBar search={<Palette />} openAnomalies={open} site={SITE.name.split(",")[0]} />;
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
      ["Incident review", "/review"],
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
