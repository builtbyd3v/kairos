import type { analyze } from "@/lib/kit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Rows = ReturnType<typeof analyze>["missionRows"];

/** Rounds per kit day as pill bars: clean rounds in blue, rounds that need attention capped in red. */
export function RoundsChart({ rows }: { rows: Rows }) {
  const days = [...new Set(rows.map((r) => r.start.slice(0, 10)))].sort();
  const perDay = days.map((d) => {
    const today = rows.filter((r) => r.start.startsWith(d));
    return { day: d, clean: today.filter((r) => r.truth === "CLEAN").length, attention: today.filter((r) => r.truth !== "CLEAN").length };
  });
  const max = Math.max(...perDay.map((d) => d.clean + d.attention));
  const col = 30;
  const H = 120;
  const unit = (H - 8) / max;
  const attention = rows.filter((r) => r.truth !== "CLEAN").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rounds by day</CardTitle>
        <CardDescription>
          {days[0]?.slice(5)} to {days.at(-1)?.slice(5)} (kit time)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="flex items-baseline gap-2">
          <span className="font-mono text-3xl font-medium tabular-nums">{rows.length}</span>
          <span className="text-sm text-muted-foreground">rounds</span>
          <span className="ml-auto text-sm text-recall tabular-nums">{attention} need attention</span>
        </p>
        <p className="flex gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full bg-primary" /> Clean
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full bg-recall" /> Failed inspections or serious anomaly
          </span>
        </p>
        <svg viewBox={`0 0 ${perDay.length * col} ${H + 16}`} className="w-full" role="img" aria-label={perDay.map((d) => `${d.day}: ${d.clean} clean, ${d.attention} need attention`).join("; ")}>
          {perDay.map((d, i) => {
            const x = i * col + col / 2 - 7;
            const cleanH = d.clean * unit;
            const attH = d.attention * unit;
            return (
              <g key={d.day}>
                <line x1={x + 7} x2={x + 7} y1={4} y2={H} className="stroke-border" strokeWidth="1" />
                {d.clean > 0 && <rect x={x} y={H - cleanH} width="14" height={cleanH} rx="7" className="fill-primary/80" />}
                {d.attention > 0 && <rect x={x} y={H - cleanH - attH - (d.clean ? 3 : 0)} width="14" height={attH} rx="7" className="fill-recall" />}
                <text x={x + 7} y={H + 13} textAnchor="middle" fontSize="9" className="fill-helper">
                  {Number(d.day.slice(8))}
                </text>
              </g>
            );
          })}
        </svg>
      </CardContent>
    </Card>
  );
}
