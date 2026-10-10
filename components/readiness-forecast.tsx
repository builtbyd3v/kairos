import { Suspense, type CSSProperties } from "react";
import { connection } from "next/server";
import { loadKit } from "@/lib/kit";
import { weatherNow } from "@/lib/scenario";
import { forecast, NO_DATA, type Slot } from "@/lib/forecast";
import { et } from "@/components/next-round";
import { VerdictChip } from "@/components/status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Why } from "@/components/why";

const W = 900;
const TIP_W = 170;
const BAR_W = (bandW: number) => Math.max(1, Math.min(bandW, 14)); // thin bar centered in its ghost slot, like the reference
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
  const [kit, { weather, now }] = await Promise.all([loadKit(), weatherNow()]);
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
        <CardDescription>The call for a round launched in each hour</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul aria-label="Legend" className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
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

        <div className="panel-inset px-4 pt-3 pb-2">
          <svg viewBox={`0 0 ${W} 76`} width="100%" aria-hidden className="overflow-visible text-[11px]">
            {f.bands.map((b, i) => {
              const bx = x(b.start);
              const bw = Math.max(0, x(b.end) - bx - 4);
              const tipX = Math.min(Math.max(bx + bw / 2 - TIP_W / 2, 0), W - TIP_W);
              return (
                // note: per-bar stagger is data-driven, so it rides a CSS var in style rather than a static class.
                <g key={b.start.toISOString()} className="group/bar" style={{ "--rise-delay": `${i * 25}ms` } as CSSProperties}>
                  <rect x={bx} y={14} width={bw} height={36} rx={3} className="fill-white/[0.035] transition-colors group-hover/bar:fill-white/[0.08]" />
                  <rect x={bx + bw / 2 - BAR_W(bw) / 2} y={18} width={BAR_W(bw)} height={32} rx={2} className={cn("animate-grow-y", fill(b))}>
                    <title>{`${time(b.start)} ET: ${label(b)}${b.verdict === "GO" ? "" : `. ${b.reasons[0]?.text ?? ""}`}`}</title>
                  </rect>
                  {/* Green cap: the outdoor leg is the only blocker, so an indoor-only round could launch. */}
                  {b.indoorOnly && <rect x={bx + bw / 2 - BAR_W(bw) / 2} y={18} width={BAR_W(bw)} height={5} rx={1} className="fill-go" />}
                  <g className="pointer-events-none opacity-0 transition-opacity group-hover/bar:opacity-100">
                    <rect x={tipX} y={-44} width={TIP_W} height={38} rx={6} className="fill-popover stroke-border" />
                    <text x={tipX + 10} y={-29} className="fill-muted-foreground font-mono text-[10px]">
                      {time(b.start)} ET
                    </text>
                    <text x={tipX + 10} y={-14} className="fill-foreground font-medium">
                      {label(b)}
                    </text>
                  </g>
                </g>
              );
            })}
            <line x1={0} x2={W} y1={54} y2={54} strokeDasharray="1 4" className="stroke-helper/60" />
            {ticks.map((b) => (
              <text key={b.start.toISOString()} x={x(b.start)} y={70} textAnchor="middle" className="fill-helper font-mono text-[10px]">
                {hourEt(b.start) === 0 ? et(b.start, { weekday: "short" }).toUpperCase() : et(b.start, { hour: "numeric" })}
              </text>
            ))}
            <g className="fill-foreground stroke-foreground">
              <line x1={1} x2={1} y1={10} y2={58} strokeWidth={2} />
              <text x={0} y={70} stroke="none" className="font-mono text-[10px] font-medium">
                NOW
              </text>
            </g>
            {f.rounds.map((r) => {
              const rx = x(r.start);
              return (
                <g key={r.start.toISOString()} className="pointer-events-none fill-foreground stroke-foreground">
                  <line x1={rx} x2={rx} y1={10} y2={54} strokeDasharray="3 2" />
                  <text x={rx} y={6} stroke="none" textAnchor={rx < 40 ? "start" : rx > W - 40 ? "end" : "middle"} className="font-mono text-[10px]">
                    {et(r.start, { hour: "numeric" })} round
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <p className="sr-only">
          Launch verdicts over the next 24 hours, Eastern Time:{" "}
          {runs.map((r) => `${r.label} from ${time(r.start)} to ${time(r.end)}`).join("; ")}.
        </p>

        <ul aria-label="Scheduled rounds" className="grid grid-cols-3 gap-3">
          {f.rounds.map((r) => (
            <li key={r.start.toISOString()} className="panel-inset px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {et(r.start, { weekday: "short", hour: "numeric", minute: "2-digit" })} ET
                </span>
                <VerdictChip verdict={r.verdict} />
              </div>
              <p className={cn("mt-1.5 text-sm", r.verdict === "GO" && "text-muted-foreground")}>
                {r.verdict === "GO" ? "No blocking limits" : r.reasons[0]?.text.split(";")[0]}
                {r.indoorOnly && <span className="block text-xs text-go">Indoor only (skip WP01) is GO</span>}
              </p>
            </li>
          ))}
        </ul>

        <Why label="Assumptions">
          Each band is a {f.minutes} min round{f.outdoor ? " with the outdoor stop at WP01" : ""}, repeating the latest kit mission&apos;s route and start battery. Active NWS alerts count for every hour.
          {lastStep && f.to.getTime() > Date.parse(lastStep.time) + 3600000 && <> Forecast data ends {time(new Date(Date.parse(lastStep.time) + 3600000))} ET; later launches hold until it arrives.</>}
        </Why>
      </CardContent>
    </Card>
  );
}
