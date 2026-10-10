import rounds from "@/data/replay/kit-rounds-weather.json";
import type { Kit } from "./kit";
import { decide, type Verdict, type WeatherStep } from "./verdict.ts";
import { drainPerMin, isOutdoor, routeOf } from "./route.ts";

type RoundsFixture = { rounds: { missionId: string; start: string; durationMin: number; steps: WeatherStep[]; alerts: string[] }[] };

/**
 * Backtest: run today's rules over the real archived weather at each kit round's start time.
 * Answers "how often would this have held Spot?", the cry-wolf check.
 */
export function backtest(kit: Kit) {
  return (rounds as RoundsFixture).rounds.map((r) => {
    const m = kit.missions.find((x) => x.id === r.missionId)!;
    const start = new Date(r.start);
    const end = new Date(start.getTime() + r.durationMin * 60000);
    const route = routeOf(kit, m.id);
    const health = {
      outdoor: isOutdoor(route),
      batteryPct: m.startBattery,
      projectedEndPct: m.startBattery - drainPerMin(kit, m.config) * r.durationMin,
      routeRisk: [],
    };
    const { verdict, reasons } = decide({ fetchedAt: start.toISOString(), source: "Open-Meteo ERA5 archive", alerts: r.alerts, steps: r.steps }, health, { now: start, start, end }, false);
    return { missionId: m.id, start: r.start, outdoor: health.outdoor, verdict: verdict as Verdict, reason: reasons.find((x) => x.verdict !== "GO")?.text ?? null };
  });
}
