import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyze, loadKit } from "@/lib/kit";
import { parseEvents } from "@/lib/live";
import { DOCK, OUTDOOR_WAYPOINTS } from "@/lib/route";
import { LiveRound } from "@/components/live-round";
import { LiveRadar, WeatherWatch } from "@/components/weather-watch";

// note: reads NextEra's replay stream from the kit file once per server start (same rows as Neon's replay_events).
const EVENTS = parseEvents(readFileSync(join(process.cwd(), "data/kit/replay.ndjson"), "utf8"));

export default async function LivePage() {
  const kit = await loadKit();
  const inStream = new Set(EVENTS.map((e) => e.missionId));
  const completed = new Set(EVENTS.filter((e) => e.type === "MISSION_COMPLETED").map((e) => e.missionId));
  // The planned route is known before launch (Autowalk). Results come only from the stream.
  const missions = kit.missions
    .filter((m) => inStream.has(m.id))
    .map((m) => ({ id: m.id, name: m.name, config: m.config, plan: kit.actions.filter((a) => a.missionId === m.id).map((a) => ({ id: a.id, locationId: a.locationId, type: a.type })) }));
  const defaultId =
    missions.findLast((m) => m.config === "V2" && completed.has(m.id) && kit.anomalies.some((a) => a.missionId === m.id))?.id ?? missions[0].id;
  const names = Object.fromEntries([...kit.locations, ...kit.assets].map((x) => [x.id, x.name]));

  return (
    <LiveRound
      missions={missions}
      defaultId={defaultId}
      events={EVENTS}
      anomalies={kit.anomalies.map(({ id, actionId, type, severity }) => ({ id, actionId, type, severity }))}
      readings={kit.readings}
      names={names}
      sites={analyze(kit).sites}
      dock={DOCK}
      outdoor={[...OUTDOOR_WAYPOINTS]}
      watch={<WeatherWatch />}
      radar={<LiveRadar />}
    />
  );
}
