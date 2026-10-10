import { waterLikelihood } from "./water-confidence.ts";

// The dispatcher's rules: weather + robot health in, GO / HOLD / RECALL out, with a reason and source per rule.
// Pure functions, no I/O, so the same rules run on live NWS data and on the storm replay.

export type Verdict = "GO" | "HOLD" | "RECALL";

export type WeatherStep = {
  time: string; // ISO start of the step
  precipMmPerHour: number | null;
  thunderPct: number | null;
  gustKmh: number | null;
  tempC: number | null;
};

export type Weather = {
  fetchedAt: string;
  source?: string; // where the steps came from, shown next to weather reasons
  alerts: string[]; // NWS alert event names, e.g. "Severe Thunderstorm Warning"
  steps: WeatherStep[]; // covering at least the mission window
};

export type Health = {
  outdoor: boolean; // does the route leave the building? Weather only gates outdoor routes.
  batteryPct: number;
  projectedEndPct: number; // battery when Spot is back on the dock, from the kit's drain rate
  routeRisk: { locationId: string; name: string; successPct: number }[]; // weakest waypoints on the route
};

export type Reason = { verdict: Verdict; text: string; source: string };

// note: thresholds marked ASSUMPTION are ours, not NextEra's or Boston Dynamics'. Ask NextEra for their procedure values.
export const LIMITS = {
  maxTempC: 55, // Boston Dynamics current spec (-20 to 55 C); NextEra says their Spots run to about 57 C. The 2019 guide (p.22) said 45 C.
  minTempC: -20, // Spot guide p.22, p.61
  tempMarginC: 5, // ASSUMPTION: stay 5 C inside the rated range
  moderateRainMmPerHour: 2.5, // AMS "light rain" ends at 2.5 mm/h; Spot guide p.22 allows light rain only
  thunderPct: 30, // ASSUMPTION: guide is silent on lightning
  gustKmh: 50, // ASSUMPTION: guide is silent on wind
  minDockBatteryPct: 20, // kit: actions below 20% battery succeed 27% of the time
  staleMinutes: 30, // ASSUMPTION: older weather counts as unknown
} as const;

export const RECALL_ALERTS = ["Tornado Warning", "Severe Thunderstorm Warning", "Flash Flood Warning", "Extreme Heat Warning", "Hurricane Warning", "Tropical Storm Warning"];
export const HOLD_ALERTS = ["Tornado Watch", "Severe Thunderstorm Watch", "Flash Flood Watch", "Flood Warning", "Heat Advisory", "Hurricane Watch", "Tropical Storm Watch"];
// note: ASSUMPTION: a thunderstorm only threatens Spot outdoors (lightning, rain, gusts), so it can still allow an indoor-only round.
// Every other acted-on alert (tornado, tropical, flood, heat) can reach the buildings, power or staff, so it never does.
const OUTDOOR_ONLY_ALERTS = ["Severe Thunderstorm Warning", "Severe Thunderstorm Watch"];

const RANK: Record<Verdict, number> = { GO: 0, HOLD: 1, RECALL: 2 };

/**
 * Decide one mission. `inProgress` turns a hazard into RECALL; before launch the worst case is HOLD.
 * The window runs from launch (or now, if in progress) to when Spot would be back on the dock.
 */
export function decide(
  weather: Weather | null,
  health: Health,
  { now, start, end }: { now: Date; start: Date; end: Date },
  inProgress: boolean,
  vision?: Vision,
): { verdict: Verdict; reasons: Reason[]; indoorOnly: Reason | null } {
  const reasons: Reason[] = [];
  let indoorSafe = false; // weather is fresh, covers the window, and no site-wide alert is active
  const hazard = inProgress ? "RECALL" : "HOLD";

  const ageMin = weather ? (now.getTime() - new Date(weather.fetchedAt).getTime()) / 60000 : Infinity;
  if (!health.outdoor) {
    reasons.push({ verdict: "GO", text: "Route stays indoors, so weather does not gate it", source: "Route map" });
  } else if (!weather || ageMin > LIMITS.staleMinutes) {
    // Missing data must never look green.
    reasons.push({ verdict: "HOLD", text: "Weather data is missing or stale, so conditions are unknown", source: "Dispatcher rule" });
  } else {
    for (const alert of weather.alerts) {
      if (RECALL_ALERTS.includes(alert)) reasons.push({ verdict: hazard, text: `${alert} in effect`, source: "NWS active alerts" });
      else if (HOLD_ALERTS.includes(alert)) reasons.push({ verdict: "HOLD", text: `${alert} in effect`, source: "NWS active alerts" });
    }

    const window = weather.steps.filter((s) => {
      const t = new Date(s.time).getTime();
      // Steps are up to an hour long, so include the one already running at the window start.
      return t > start.getTime() - 3600000 && t <= end.getTime();
    });
    const observed = window.some((s) => s.precipMmPerHour !== null || s.thunderPct !== null || s.gustKmh !== null || s.tempC !== null);
    if (!observed)
      reasons.push({ verdict: "HOLD", text: "No weather data covers this mission window yet", source: "Dispatcher rule: unknown is never GO" });
    indoorSafe = observed && weather.alerts.every((a) => OUTDOOR_ONLY_ALERTS.includes(a) || !(RECALL_ALERTS.includes(a) || HOLD_ALERTS.includes(a)));
    const peak = (pick: (s: WeatherStep) => number | null) => {
      const values = window.map(pick).filter((v): v is number => v !== null);
      return values.length ? Math.max(...values) : null;
    };
    const rain = peak((s) => s.precipMmPerHour);
    const thunder = peak((s) => s.thunderPct);
    const gust = peak((s) => s.gustKmh);
    const hot = peak((s) => s.tempC);
    const cold = window.map((s) => s.tempC).filter((v): v is number => v !== null).reduce((a, b) => Math.min(a, b), Infinity);

    if (rain !== null && rain > LIMITS.moderateRainMmPerHour)
      reasons.push({ verdict: hazard, text: `Rain up to ${rain.toFixed(1)} mm/h before Spot can dock; Spot is rated for light rain and splashes only (IP54)`, source: "Spot guide p.22, p.61. Orbit's launch gate checks the rain forecast; this checks the rain rate until Spot docks" });
    else if (rain !== null && rain > 0)
      reasons.push({ verdict: "GO", text: `Light rain (${rain.toFixed(1)} mm/h) is within Spot's rating, but expect wet, slippery floors after`, source: "Spot guide p.21-22" });
    const feed = weather.source ?? "NWS forecast grid";
    const warned = weather.alerts.some((a) => RECALL_ALERTS.includes(a));
    // A warning already covers thunder; do not count the same storm twice.
    if (thunder !== null && thunder >= LIMITS.thunderPct && !(thunder >= 100 && warned))
      reasons.push({
        verdict: hazard,
        text: thunder >= 100 ? "Thunder reported" : `${Math.round(thunder)}% chance of thunder before Spot can dock`,
        source: `${feed}; threshold is our assumption`,
      });
    if (gust !== null && gust >= LIMITS.gustKmh)
      reasons.push({ verdict: hazard, text: `Gusts up to ${Math.round(gust)} km/h`, source: `${feed}; threshold is our assumption` });
    if (hot !== null && hot >= LIMITS.maxTempC - LIMITS.tempMarginC)
      reasons.push({ verdict: hazard, text: `Air temperature reaches ${Math.round(hot)} C; Spot's limit is ${LIMITS.maxTempC} C`, source: "Boston Dynamics spec; NextEra workshop" });
    if (cold <= LIMITS.minTempC + LIMITS.tempMarginC)
      reasons.push({ verdict: hazard, text: `Air temperature drops to ${Math.round(cold)} C; Spot's limit is ${LIMITS.minTempC} C`, source: "Spot guide p.22" });
  }

  if (health.projectedEndPct < LIMITS.minDockBatteryPct)
    reasons.push({
      verdict: "HOLD",
      text: `Spot would dock at about ${Math.round(health.projectedEndPct)}% battery (starts at ${health.batteryPct}%). Below 20%, inspections succeed only 27% of the time`,
      source: "NextEra kit drain rates",
    });
  for (const r of health.routeRisk.filter((r) => r.successPct < 75))
    reasons.push({ verdict: "GO", text: `${r.name} succeeds only ${r.successPct}% of the time; check results there first`, source: "NextEra kit" });

  if (vision) reasons.push(visionReason(vision));

  const verdict = reasons.reduce<Verdict>((v, r) => (RANK[r.verdict] > RANK[v] ? r.verdict : v), "GO");
  // Blocking reasons first, then advisories.
  reasons.sort((a, b) => RANK[b.verdict] - RANK[a.verdict]);

  // Partial route: before launch, if only outdoor weather holds the round, offer it without the outdoor leg.
  // Re-deciding as an indoor route reuses the indoor rule, so battery and any other non-weather HOLD still block it.
  // In a mission this stays null: Spot may be on or heading to the outdoor leg, so RECALL stands.
  // note: keeps the full route's battery projection; skipping the outdoor leg only saves battery.
  const indoorOnly =
    !inProgress && verdict === "HOLD" && health.outdoor && indoorSafe && decide(weather, { ...health, outdoor: false }, { now, start, end }, false).verdict === "GO"
      ? { verdict: "GO" as const, text: "Indoor only: skip the outdoor leg, run the indoor stops", source: "Dispatcher rule: weather limits apply outdoors only; tornado, tropical, flood and heat alerts block it (our assumption)" }
      : null;
  return { verdict, reasons, indoorOnly };
}

// Water vision: what the floor model saw at the current waypoint. Boxes are normalized 0-1, origin top-left.
export type Box = { x: number; y: number; w: number; h: number };
export type Vision = { status: "ok" | "pending" | "stale" | "error"; waypoint: string; boxes: (Box & { score: number })[]; model: string };

// note: ASSUMPTION: Spot's walking lane seen from a forward camera: a trapezoid from the bottom of the frame (near) to y = top (far).
// No Spot camera calibration in the kit, so the lane is fixed in the frame.
export const PATH = { top: 0.45, topL: 0.42, topR: 0.58, botL: 0.2, botR: 0.8 } as const;
/** Lane edges at image row y (0 = top, 1 = bottom). */
export const laneAt = (y: number) => {
  const t = Math.min(1, Math.max(0, (y - PATH.top) / (1 - PATH.top)));
  return { l: PATH.topL + (PATH.botL - PATH.topL) * t, r: PATH.topR + (PATH.botR - PATH.topR) * t };
};
/** A box is in the path when its near (bottom) edge is below the lane's far end and it overlaps the lane at that row. */
export const inPath = (b: Box) => {
  const near = Math.min(1, b.y + b.h);
  if (near <= PATH.top) return false;
  const { l, r } = laneAt(near);
  return b.x < r && b.x + b.w > l;
};

/** Floor rule: water in Spot's path holds Spot at the waypoint until an operator confirms. Unknown floor is never GO. */
export function visionReason(v: Vision): Reason {
  const source = `Water model ${v.model}; advisory, operator confirms`;
  if (v.status !== "ok")
    return { verdict: "HOLD", text: `Floor at ${v.waypoint} is unknown: water model ${v.status === "pending" ? "still checking" : v.status}`, source: "Dispatcher rule: unknown is never GO" };
  const hit = v.boxes.filter(inPath).sort((a, b) => b.score - a.score)[0];
  // A whole-frame box means an image classifier (v1): it says the frame looks wet, not where the water is.
  if (hit && hit.w * hit.h > 0.99)
    return { verdict: "HOLD", text: `Possible water at ${v.waypoint} (p=${hit.score.toFixed(2)}); location and size unknown with an image classifier: hold at this waypoint`, source };
  if (hit) {
    const pct = waterLikelihood(hit.score)?.pct;
    return { verdict: "HOLD", text: `Water in Spot's path at ${v.waypoint}${pct ? ` (${pct}% likely)` : ""}: hold here`, source };
  }
  if (v.boxes.length) return { verdict: "GO", text: `Water seen at ${v.waypoint}, outside Spot's path; check it after the round`, source };
  return { verdict: "GO", text: `No water seen at ${v.waypoint} (advisory only)`, source };
}

// The Orbit call each verdict maps to. note: simulated; real endpoints per Boston Dynamics Orbit API docs.
export const ORBIT_CALL: Record<Verdict, string | null> = {
  GO: null,
  HOLD: "POST /api/v0/calendar/disable-enable (pause schedule)",
  RECALL: "POST /api/v0/graph/send-robot then POST /api/v0/calendar/mission/dispatch/{robot_nickname}?currentDriverId={driver_id} (return to dock)",
};
