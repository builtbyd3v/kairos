import { connection } from "next/server";
import { Radio } from "lucide-react";
import { loadKit } from "@/lib/kit";
import { recentDecisions } from "@/lib/decisions";
import { recentReviews } from "@/lib/reviews";
import { VerdictChip } from "@/components/status";
import { pgDate, ReviewChip } from "@/components/triage-inbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ago = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

/** Latest dispatch decisions and anomaly triage, merged by time. `now` comes from the caller, read after connection(). */
export async function ActivityFeed({ now }: { now: Date }) {
  await connection();
  const [kit, decisions, reviews] = await Promise.all([loadKit(), recentDecisions(), recentReviews(8)]);
  const anomaly = new Map(kit.anomalies.map((a) => [a.id, a]));
  const asset = new Map(kit.assets.map((a) => [a.id, a.name]));

  const items = [
    ...decisions.map((d) => ({
      key: `d${d.id}`,
      at: pgDate(d.created_at),
      chip: <VerdictChip verdict={d.verdict} />,
      text: `${d.operator_action === "confirmed" ? "Confirmed" : "Overrode"} ${d.verdict}${d.reasons[0]?.text.startsWith("Indoor only") ? ", indoor only," : ""} for the ${d.source === "replay" ? "storm drill" : "next round"}${d.orbit_call ? `, sent ${d.orbit_call}` : ""}`,
    })),
    ...reviews.map((r, i) => {
      const a = anomaly.get(r.anomaly_id);
      return {
        key: `r${i}${r.created_at}`,
        at: pgDate(r.created_at),
        chip: <ReviewChip status={r.status} />,
        text: a ? `${a.type.replaceAll("_", " ").toLowerCase()} on ${asset.get(a.assetId) ?? a.assetId} (${a.id})` : r.anomaly_id,
      };
    }),
  ]
    .sort((x, y) => y.at.getTime() - x.at.getTime())
    .slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Radio aria-hidden className="size-4 text-helper" />
            Nothing yet today
          </p>
        ) : (
          <ol className="space-y-3">
            {items.map((it) => (
              <li key={it.key} className="flex animate-row items-start gap-2.5 text-sm">
                {it.chip}
                <span className="min-w-0 flex-1 leading-snug first-letter:uppercase">{it.text}</span>
                <time dateTime={it.at.toISOString()} className="shrink-0 font-mono text-xs text-helper tabular-nums">
                  {ago(now.getTime() - it.at.getTime())}
                </time>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
