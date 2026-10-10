// 24-hour readiness forecast: the verdict each scheduled round, and a round launched at any hour, would get.
// Pure: weather, kit and the clock come in as arguments.
import type { Kit } from "./kit";
import { decide, type Health, type Reason, type Verdict, type Weather } from "./verdict.ts";
import { drainPerMin, isOutdoor, routeOf } from "./route.ts";

const HOUR = 3600000;
const DAY = 24 * HOUR;
export const ROUND_HOURS_ET = [2, 10, 18]; // the kit's mission schedule, plant time
export const NO_DATA = "No weather data covers this mission window yet"; // decide()'s text for an uncovered window

export type Slot = { start: Date; end: Date; verdict: Verdict; reasons: Reason[]; indoorOnly: Reason | null };

/** Next-round health, same as planNextRound: the latest kit mission's route and start battery. */
export function roundHealth(kit: Kit): { health: Health; minutes: number } {
  const last = kit.missions.at(-1)!;
  const route = routeOf(kit, last.id);
  const minutes = last.durationMin;
  // note: mirrors analyze(kit).sites + pct inline, so this file does not load the DB client in tests.
  const routeRisk = kit.locations
    .filter((l) => route.includes(l.id))
    .map((l) => {
      const acts = kit.actions.filter((a) => a.locationId === l.id);
      const ok = acts.filter((a) => a.ok).length;
      return { locationId: l.id, name: l.name, successPct: acts.length ? Math.round((100 * ok) / acts.length) : 0 };
    })
    .sort((x, y) => x.successPct - y.successPct)
    .slice(0, 2);
  const startPct = last.startBattery;
  return { minutes, health: { outdoor: isOutdoor(route), batteryPct: startPct, projectedEndPct: startPct - drainPerMin(kit, last.config) * minutes, routeRisk } };
}

/** Round launches in (now, now + 24 h]. */
export function roundStarts(now: Date): Date[] {
  // Same wall-clock trick as nextRoundStart in components/next-round.tsx.
  // note: one offset for the whole day, so a round right after a DST switch is off by an hour.
  const wall = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const offset = Math.round((now.getTime() - wall.getTime()) / 60000) * 60000; // toLocaleString drops seconds; keep rounds on the minute
  const out: Date[] = [];
  for (let day = 0; day < 2; day++)
    for (const hour of ROUND_HOURS_ET) {
      const c = new Date(wall);
      c.setDate(c.getDate() + day);
      c.setHours(hour, 0, 0, 0);
      const t = c.getTime() + offset;
      if (t > now.getTime() && t <= now.getTime() + DAY) out.push(new Date(t));
    }
  return out;
}

// note: decide() applies today's active NWS alerts to every window; alert expiry times are not fetched.
export function forecast(weather: Weather | null, kit: Kit, now: Date) {
  const { health, minutes } = roundHealth(kit);
  const slot = (start: Date): Slot => {
    const end = new Date(start.getTime() + minutes * 60000);
    return { start, end, ...decide(weather, health, { now, start, end }, false) };
  };
  const rounds = roundStarts(now).map(slot);
  // One band per clock hour from now to now + 24 h; the first starts now. Each band = a round launched at its start.
  const bands: Slot[] = [];
  for (let t = now.getTime(); t < now.getTime() + DAY; t = Math.floor(t / HOUR) * HOUR + HOUR) {
    const band = slot(new Date(t));
    bands.push({ ...band, end: new Date(Math.min(Math.floor(t / HOUR) * HOUR + HOUR, now.getTime() + DAY)) });
  }
  // The next safe step after a HOLD: the first hour a full round would launch GO. Null if none in the next 24 h.
  const nextGo = bands.find((b) => b.verdict === "GO")?.start ?? null;
  return { from: now, to: new Date(now.getTime() + DAY), minutes, outdoor: health.outdoor, rounds, bands, nextGo };
}

export type Forecast = ReturnType<typeof forecast>;
