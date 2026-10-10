import type { Kit } from "./kit";

// Route geometry and battery math, from the kit's waypoints and missions.
// note: ASSUMPTIONS (shown in the UI): kit x/y units are meters, WP01's entrance apron is outdoors,
// WP15 Inspection Dock is the dock, Spot walks routes at 1 m/s, and each floor change costs 1 min on stairs.
export const OUTDOOR_WAYPOINTS = new Set(["WP01"]);
export const DOCK = "WP15";
const WALK_M_PER_MIN = 60; // 1 m/s; Spot's rated maximum is 1.6 m/s (Spot guide p.61)
const STAIRS_MIN_PER_FLOOR = 1;

/** Waypoints a mission visits, in action order. */
export function routeOf(kit: Kit, missionId: string): string[] {
  return kit.actions.filter((a) => a.missionId === missionId).map((a) => a.locationId);
}

export const isOutdoor = (route: string[]) => route.some((id) => OUTDOOR_WAYPOINTS.has(id));

/** Average battery percent used per minute by missions on this configuration. */
export function drainPerMin(kit: Kit, config: string): number {
  const ms = kit.missions.filter((m) => m.config === config);
  const used = ms.reduce((n, m) => n + m.startBattery - m.endBattery, 0);
  const minutes = ms.reduce((n, m) => n + m.durationMin, 0);
  return minutes ? used / minutes : 0;
}

/** Minutes for Spot to walk from a waypoint straight back to the dock. */
export function returnMinutes(kit: Kit, fromLocationId: string): number {
  const at = new Map(kit.locations.map((l) => [l.id, l]));
  const from = at.get(fromLocationId);
  const dock = at.get(DOCK);
  if (!from || !dock) return 0;
  const meters = Math.hypot(from.x - dock.x, from.y - dock.y);
  return meters / WALK_M_PER_MIN + Math.abs(from.floor - dock.floor) * STAIRS_MIN_PER_FLOOR;
}
