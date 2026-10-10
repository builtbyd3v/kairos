import { Suspense } from "react";
import { connection } from "next/server";
import { loadKit } from "@/lib/kit";
import { getLiveWeather } from "@/lib/weather";
import { forecast, NO_DATA, type Slot } from "@/lib/forecast";
import { et } from "@/components/next-round";
import { VerdictChip } from "@/components/status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const W = 900;
const noData = (s: Slot) => s.reasons.some((r) => r.text === NO_DATA);
// HOLD for "no forecast yet" is drawn fainter than a weather HOLD so the operator can tell them apart. RECALL cannot occur before launch.
const fill = (s: Slot) => (s.verdict === "GO" ? "fill-go/70" : s.verdict === "RECALL" ? "fill-recall/80" : noData(s) ? "fill-hold/20" : "fill-hold/70");
const label = (s: Slot) => (s.verdict === "GO" ? "GO" : noData(s) ? "HOLD, no forecast yet" : s.indoorOnly ? "HOLD, indoor only is GO" : s.verdict);
const time = (d: Date) => et(d, { hour: "numeric", minute: "2-digit" });
const hourEt = (d: Date) => Number(et(d, { hour: "numeric", hourCycle: "h23" }));

/** "Next 24 hours" card: hourly launch verdicts plus the scheduled rounds. Reads the clock, so it carries its own Suspense. */
export function ReadinessForecast() {
  return (
    <Suspense
      fallback={
        <Card className="px-4 text-sm text-muted-foreground" aria-busy>
          Loading the 24-hour forecast…
        </Card>
      }
    >
      <ForecastCard />
    </Suspense>
  );
}

async function ForecastCard() {
  await connection();
  const now = new Date();
  const [kit, weather] = await Promise.all([loadKit(), getLiveWeather()]);
  const f = forecast(weather, kit, now);
  const x = (d: Date) => ((d.getTime() - f.from.getTime()) / (f.to.getTime() - f.from.getTime())) * W;
  const ticks = f.bands.filter((b) => b.start.getTime() % 3600000 === 0 && hourEt(b.start) % 3 === 0 && x(b.start) > 36);
  // Runs of the same verdict, for the screen-reader summary.
  const runs = f.bands.reduce<{ label: string; start: Date; end: Date }[]>((acc, b) => {
    const prev = acc.at(-1);
    if (prev?.label === label(b)) prev.end = b.end;
    else acc.push({ label: label(b), start: b.start, end: b.end });
    return acc;
  }, []);
  const lastStep = weather?.steps.at(-1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Next 24 hours</CardTitle>
        <CardDescription>
          Each band is the verdict a round launched in that hour would get · {f.minutes} min round, {f.outdoor ? "includes the outdoor leg at WP01" : "indoors only"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul aria-label="Legend" className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm bg-go/70" /> GO
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm bg-hold/70" /> HOLD, weather or battery
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm bg-hold/20" /> HOLD, no forecast yet
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm border-t-4 border-go bg-hold/70" /> HOLD, indoor only is GO (skip WP01)
          </li>
        </ul>

        <svg viewBox={`0 0 ${W} 76`} width="100%" aria-hidden className="overflow-visible text-[11px]">
          {f.bands.map((b) => (
            <rect key={b.start.toISOString()} x={x(b.start)} y={18} width={Math.max(0, x(b.end) - x(b.start) - 1)} height={32} rx={2} className={fill(b)}>
              <title>{`${time(b.start)} ET: ${label(b)}${b.verdict === "GO" ? "" : `. ${b.reasons[0]?.text ?? ""}`}`}</title>
            </rect>
          ))}
          {/* Green cap: the outdoor leg is the only blocker, so an indoor-only round could launch. */}
          {f.bands
            .filter((b) => b.indoorOnly)
            .map((b) => (
              <rect key={`i${b.start.toISOString()}`} x={x(b.start)} y={18} width={Math.max(0, x(b.end) - x(b.start) - 1)} height={5} className="fill-go" />
            ))}
          {ticks.map((b) => (
            <g key={b.start.toISOString()} className="fill-helper stroke-border">
              <line x1={x(b.start)} x2={x(b.start)} y1={52} y2={58} />
              <text x={x(b.start)} y={71} textAnchor="middle" stroke="none">
                {hourEt(b.start) === 0 ? et(b.start, { weekday: "short" }) : et(b.start, { hour: "numeric" })}
              </text>
            </g>
          ))}
          <g className="fill-foreground stroke-foreground">
            <line x1={1} x2={1} y1={14} y2={58} strokeWidth={2} />
            <text x={0} y={71} stroke="none" className="font-medium">
              Now
            </text>
          </g>
          {f.rounds.map((r) => {
            const rx = x(r.start);
            return (
              <g key={r.start.toISOString()} className="fill-foreground stroke-foreground">
                <line x1={rx} x2={rx} y1={14} y2={54} strokeDasharray="3 2" />
                <text x={rx} y={10} stroke="none" textAnchor={rx < 40 ? "start" : rx > W - 40 ? "end" : "middle"}>
                  {et(r.start, { hour: "numeric" })} round
                </text>
              </g>
            );
          })}
        </svg>
        <p className="sr-only">
          Launch verdicts over the next 24 hours, Eastern Time:{" "}
          {runs.map((r) => `${r.label} from ${time(r.start)} to ${time(r.end)}`).join("; ")}.
        </p>

        <ul aria-label="Scheduled rounds" className="grid grid-cols-3 gap-3">
          {f.rounds.map((r) => (
            <li key={r.start.toISOString()} className="rounded-md bg-secondary/60 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {et(r.start, { weekday: "short", hour: "numeric", minute: "2-digit" })} ET
                </span>
                <VerdictChip verdict={r.verdict} />
              </div>
              <p className={cn("mt-1.5 text-sm", r.verdict === "GO" && "text-muted-foreground")}>
                {r.verdict === "GO" ? "No blocking limits" : r.reasons[0]?.text}
                {r.indoorOnly && <span className="block text-xs text-go">Indoor only (skip WP01) is GO</span>}
              </p>
            </li>
          ))}
        </ul>

        <p className="text-[11px] text-helper">
          Assumes each round repeats the latest kit mission&apos;s route and start battery. Active NWS alerts count for every hour.
          {lastStep && f.to.getTime() > Date.parse(lastStep.time) + 3600000 && <> Forecast data ends {time(new Date(Date.parse(lastStep.time) + 3600000))} ET; later launches hold until it arrives.</>}
        </p>
      </CardContent>
    </Card>
  );
}
