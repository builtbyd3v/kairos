// Shift handoff brief: short plain-English sentences for an operator who is not a robotics expert.
// Pure function, no I/O. Structural input types so real analyze() output fits and tests can pass a tiny fake.
import type { Verdict } from "./verdict.ts";

type Rate = { ok: number; total: number };

export type BriefInput = {
  analysis: {
    totals: { missions: number; reportedCompleted: number; clean: number };
    sites: ({ id: string; name: string } & Rate)[];
    bands: { all: Rate }[]; // bands[0] is 0-19% battery, as built by analyze()
    configs: { config: string; minBattery: number }[];
  };
  anomalies: { id: string; severity: string; reviewRequired: boolean }[];
  reviews: Record<string, { status: string }>; // currentReviews(): reopened is already dropped
  plan: { start: Date; verdict: Verdict; reasons: { text: string }[]; weather: { alerts: string[] } | null };
};

// note: same rounding as pct() in lib/kit.ts; kit.ts imports next/cache, which node tests cannot load.
const pct = ({ ok, total }: Rate) => (total ? Math.round((100 * ok) / total) : 0);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function buildBrief({ analysis, anomalies, reviews, plan }: BriefInput): string[] {
  const { totals, sites, bands, configs } = analysis;
  // Same buckets as the triage inbox: flagged and untriaged = needs review.
  const open = anomalies.filter((a) => a.reviewRequired && !reviews[a.id]);
  const critical = open.filter((a) => a.severity === "CRITICAL").length;
  const triaged = anomalies.filter((a) => reviews[a.id]).length;
  const workOrders = anomalies.filter((a) => reviews[a.id]?.status === "work_order").length;

  const worst = sites.filter((s) => s.total > 0).sort((x, y) => x.ok / x.total - y.ok / y.total)[0];
  const v1 = configs.find((c) => c.config === "V1");
  const time = plan.start.toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" });
  const reason = plan.reasons[0]?.text ?? "No dispatcher rule raised a concern";
  const weather = plan.weather;

  return [
    `${totals.reportedCompleted} of ${totals.missions} rounds reported COMPLETED, but only ${totals.clean} ${totals.clean === 1 ? "was" : "were"} clean.`,
    `${plural(open.length, "anomaly needs", "anomalies need")} review, ${critical} critical; ${triaged} triaged so far${workOrders ? `, ${plural(workOrders, "work order", "work orders")} open` : ""}.`,
    worst && `Worst location: ${worst.id} ${worst.name}, ${pct(worst)}% of inspections OK.`,
    bands[0] && `Battery: below 20%, inspections succeed ${pct(bands[0].all)}% of the time${v1 ? `; V1 rounds drop as low as ${v1.minBattery}%` : ""}.`,
    `Next round ${time} ET: ${plan.verdict}. ${reason}.`,
    !weather
      ? "Watch: live weather is unavailable, so outdoor rounds hold until it returns."
      : weather.alerts.length
        ? `Watch: ${weather.alerts.join(", ")}.`
        : "No active weather alerts.",
  ].filter((s): s is string => Boolean(s));
}
