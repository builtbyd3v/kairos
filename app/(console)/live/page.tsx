import { analyze, loadKit } from "@/lib/kit";
import { DOCK, OUTDOOR_WAYPOINTS } from "@/lib/route";
import { RECORDED_AT } from "@/lib/scenario";
import snapshot from "@/data/demo/weather-snapshot.json";
import type { WeatherStep } from "@/lib/verdict";
import { LiveRound } from "@/components/live-round";

// note: one kit Autowalk route, cut at its first outdoor stop: four indoor stops on both floors, then the outdoor leg the storm cancels.
const MISSION = "M013";

export default async function LivePage() {
  const kit = await loadKit();
  const plan = kit.actions.filter((a) => a.missionId === MISSION).map((a) => a.locationId);
  const firstOutdoor = plan.findIndex((id) => OUTDOOR_WAYPOINTS.has(id));
  const stops = plan.slice(0, firstOutdoor + 1).filter((id, i, a) => id !== a[i - 1]);
  // note: Open-Meteo 15-minute rows carry rain only (no thunder, gust or temperature), which is how they are told apart from the hourly NWS rows.
  const steps = (snapshot.weather.steps as WeatherStep[]).filter((s) => s.tempC === null).sort((a, b) => a.time.localeCompare(b.time));

  return (
    <LiveRound
      mission={MISSION}
      stops={stops}
      sites={analyze(kit).sites}
      dock={DOCK}
      outdoor={[...OUTDOOR_WAYPOINTS]}
      steps={steps}
      alerts={snapshot.weather.alerts}
      recordedAt={RECORDED_AT}
    />
  );
}
