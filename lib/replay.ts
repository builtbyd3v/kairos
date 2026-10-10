import { decide, type Health, type Reason, type Verdict, type Weather, type WeatherStep } from "./verdict.ts";

// Storm replay: run the same dispatcher rules minute by minute over a real storm afternoon.
// No hindsight: at time T the dispatcher only sees alerts already issued and observations up to T.

export type StormFixture = {
  site: { name: string; lat: number; lon: number };
  date: string;
  window: { start: string; end: string };
  alerts: { event: string; start: string; end: string; area: string; source: string; coversSite?: boolean }[];
  steps: WeatherStep[];
  events: { time: string; label: string }[];
  assumptions: string[];
};

export type Round = {
  launch: number; // epoch ms
  durationMin: number;
  route: string[]; // waypoint ids in order
  health: Health;
  returnMin: Record<string, number>; // minutes from each waypoint to the dock
};

export type ReplayState = {
  t: number;
  phase: "waiting" | "out" | "returning" | "docked" | "done";
  verdict: Verdict;
  reasons: Reason[];
  spotAt: string | null; // waypoint id while Spot is out
  recallAt: number | null;
  recallFrom: string | null; // waypoint Spot was at when recalled
  dockAt: number | null;
};

// Only alerts that cover the site count, like api.weather.gov/alerts/active?point=.
export function weatherAt(f: StormFixture, t: number): Weather {
  return {
    fetchedAt: new Date(t).toISOString(),
    alerts: f.alerts
      .filter((a) => a.coversSite !== false && Date.parse(a.start) <= t && t < Date.parse(a.end))
      .map((a) => a.event),
    steps: f.steps.filter((s) => Date.parse(s.time) <= t),
  };
}

function verdictAt(f: StormFixture, round: Round, t: number, inProgress: boolean) {
  const now = new Date(t);
  // Current conditions: the last observed hour stands in for the next hour.
  const start = new Date(t);
  const end = new Date(t + round.durationMin * 60000);
  return decide(weatherAt(f, t), round.health, { now, start, end }, inProgress);
}

/** First moment the in-progress verdict becomes RECALL, scanning minute by minute. */
export function findRecall(f: StormFixture, round: Round): number | null {
  for (let t = round.launch; t < round.launch + round.durationMin * 60000; t += 60000) {
    if (verdictAt(f, round, t, true).verdict === "RECALL") return t;
  }
  return null;
}

export function stateAt(f: StormFixture, round: Round, t: number): ReplayState {
  const recallAt = findRecall(f, round);
  const progress = (t - round.launch) / (round.durationMin * 60000);
  const position = (at: number) => {
    const p = (at - round.launch) / (round.durationMin * 60000);
    return round.route[Math.min(round.route.length - 1, Math.max(0, Math.floor(p * round.route.length)))];
  };
  const recallFrom = recallAt === null ? null : position(recallAt);
  const dockAt = recallAt === null || recallFrom === null ? null : recallAt + (round.returnMin[recallFrom] ?? 0) * 60000;

  if (t < round.launch) {
    const { verdict, reasons } = verdictAt(f, round, t, false);
    return { t, phase: "waiting", verdict, reasons, spotAt: null, recallAt, recallFrom, dockAt };
  }
  if (recallAt !== null && t >= recallAt) {
    if (dockAt !== null && t >= dockAt) {
      // Back on the dock: the question becomes whether the next round may launch.
      const { verdict, reasons } = verdictAt(f, round, t, false);
      return { t, phase: "docked", verdict, reasons, spotAt: null, recallAt, recallFrom, dockAt };
    }
    const { reasons } = verdictAt(f, round, recallAt, true);
    return { t, phase: "returning", verdict: "RECALL", reasons, spotAt: recallFrom, recallAt, recallFrom, dockAt };
  }
  if (progress >= 1) {
    return { t, phase: "done", verdict: "GO", reasons: [], spotAt: null, recallAt, recallFrom, dockAt };
  }
  const { verdict, reasons } = verdictAt(f, round, t, true);
  return { t, phase: "out", verdict, reasons, spotAt: position(t), recallAt, recallFrom, dockAt };
}

/** Verdict bands across the whole window for the timeline, one sample per 5 minutes. */
export function bands(f: StormFixture, round: Round) {
  const out: { from: number; to: number; label: Verdict | "DONE" }[] = [];
  const start = Date.parse(f.window.start);
  const end = Date.parse(f.window.end);
  for (let t = start; t < end; t += 5 * 60000) {
    const s = stateAt(f, round, t);
    const label = s.phase === "done" ? "DONE" : s.verdict;
    const last = out.at(-1);
    if (last && last.label === label) last.to = t + 5 * 60000;
    else out.push({ from: t, to: t + 5 * 60000, label });
  }
  return out;
}
