import storm from "@/data/replay/storm-2024-05-19.json";
import { analyze, loadKit } from "@/lib/kit";
import { findRecall, stateAt, type Round, type StormFixture } from "@/lib/replay";
import { DOCK, drainPerMin, isOutdoor, OUTDOOR_WAYPOINTS, returnMinutes, routeOf } from "@/lib/route";
import { ReplayPlayer } from "@/components/replay-player";
import { DrillBranchStatus } from "@/components/drill-branch-status";
import { PageHeader } from "@/components/page-header";

const fixture = storm as StormFixture;

export default async function ReplayPage() {
  const kit = await loadKit();
  const a = analyze(kit);

  // note: the replayed round reuses the latest outdoor kit route and its start battery; the storm and the kit are separate datasets.
  const mission = [...kit.missions].reverse().find((m) => isOutdoor(routeOf(kit, m.id)))!;
  const route = routeOf(kit, mission.id);
  const drain = drainPerMin(kit, mission.config);
  const base: Omit<Round, "launch"> = {
    durationMin: mission.durationMin,
    route,
    health: { outdoor: true, batteryPct: mission.startBattery, projectedEndPct: mission.startBattery - drain * mission.durationMin, routeRisk: [] },
    returnMin: Object.fromEntries(kit.locations.map((l) => [l.id, returnMinutes(kit, l.id)])),
  };

  // Launch at the first quarter hour where the dispatcher would have said GO and the storm then forces a recall mid-round.
  // If the storm never forces one, launch at the window start and show what happened.
  const windowStart = Date.parse(fixture.window.start);
  const windowEnd = Date.parse(fixture.window.end);
  let launch = windowStart;
  for (let t = windowStart; t < windowEnd; t += 15 * 60000) {
    const round = { ...base, launch: t };
    if (stateAt(fixture, { ...round, launch: t + 1 }, t).verdict === "GO" && findRecall(fixture, round) !== null) {
      launch = t;
      break;
    }
  }

  return (
    <main>
      <PageHeader
        title="Storm drill"
        subtitle={`What if a storm hits mid-round? A real storm at ${fixture.site.name.split(",")[0]}, ${fixture.date}, replayed minute by minute.`}
      />
      <div className="space-y-4 px-8 py-6">
        <DrillBranchStatus />
        <ReplayPlayer fixture={fixture} round={{ ...base, launch }} sites={a.sites} dock={DOCK} outdoor={[...OUTDOOR_WAYPOINTS]} />
        <details className="text-xs text-helper">
          <summary className="cursor-pointer text-muted-foreground">Data sources and assumptions</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {fixture.assumptions.map((x) => (
              <li key={x}>{x}</li>
            ))}
            <li>
              Return time = straight-line distance to the WP15 dock at 1 m/s, plus 1 min per floor change. Kit x/y units are assumed to be meters. Stairs are
              assumed walkable; Spot&apos;s guide says Autowalk is not meant for stairs, so a real route may need an elevator or a same-floor dock.
            </li>
          </ul>
        </details>
      </div>
    </main>
  );
}
