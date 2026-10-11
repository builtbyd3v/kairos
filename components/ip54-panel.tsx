import { Suspense } from "react";
import { connection } from "next/server";
import { CloudLightning, Thermometer, Wind } from "lucide-react";
import { decide, LIMITS, ORBIT_CALL, type Weather } from "@/lib/verdict";
import { weatherNow } from "@/lib/scenario";
import { loadKit } from "@/lib/kit";
import { forecast } from "@/lib/forecast";
import { et } from "@/components/next-round";
import { VerdictBlock } from "@/components/status";
import { Why } from "@/components/why";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const HOURS = 12;
const ROUND_MIN = 30; // ASSUMPTION: the window a round on route needs to finish or dock
const LIMIT = LIMITS.moderateRainMmPerHour; // Spot is IP54: splashes and light rain only; heavier rain stops it
const TRACE = 0.25; // below this a forecast amount is a trace, not rain

type Hour = { at: Date; rain: number | null; thunder: number | null };
const band = (mm: number | null) => (mm === null ? "unknown" : mm < TRACE ? "dry" : mm < LIMIT ? "light" : "heavy");
const BAND = {
  dry: { fill: "fill-white/15", text: "text-muted-foreground", label: "Dry" },
  light: { fill: "fill-go", text: "text-go", label: "Light rain: OK for IP54" },
  heavy: { fill: "fill-recall", text: "text-recall", label: "Too wet for Spot" },
  unknown: { fill: "fill-white/5", text: "text-helper", label: "No data" },
} as const;

/** Hourly buckets from the feeds: the wettest step and the highest thunder chance in each hour. */
function hourly(weather: Weather | null, now: Date): Hour[] {
  const start = Math.floor(now.getTime() / 3600000) * 3600000;
  return Array.from({ length: HOURS }, (_, i) => {
    const from = start + i * 3600000;
    const steps = (weather?.steps ?? []).filter((s) => {
      const t = Date.parse(s.time);
      return t >= from && t < from + 3600000;
    });
    const rains = steps.map((s) => s.precipMmPerHour).filter((v): v is number => v !== null);
    const thunders = steps.map((s) => s.thunderPct).filter((v): v is number => v !== null);
    return { at: new Date(from), rain: rains.length ? Math.max(...rains) : null, thunder: thunders.length ? Math.max(...thunders) : null };
  });
}

/** Dashboard hero: rain against Spot's IP54 limit, now and for the next 12 hours, with the call for a Spot on route. */
export function Ip54Panel() {
  return (
    <Suspense fallback={<Card className="min-h-96 animate-pulse motion-reduce:animate-none" />}>
      <Panel />
    </Suspense>
  );
}

async function Panel() {
  await connection();
  const [{ weather, now }, kit] = await Promise.all([weatherNow(), loadKit()]);
  const health = { outdoor: true, batteryPct: 100, projectedEndPct: 100, routeRisk: [] };
  const { verdict, reasons } = decide(weather, health, { now, start: now, end: new Date(now.getTime() + ROUND_MIN * 60000) }, true);
  const { nextGo } = forecast(weather, kit, now);
  const hours = hourly(weather, now);
  const window = (weather?.steps ?? []).filter((s) => Date.parse(s.time) > now.getTime() - 3600000 && Date.parse(s.time) <= now.getTime() + ROUND_MIN * 60000);
  const peak = Math.max(0, ...window.map((s) => s.precipMmPerHour ?? 0));
  const thunder = Math.max(0, ...window.map((s) => s.thunderPct ?? 0));
  const gust = Math.max(0, ...window.map((s) => s.gustKmh ?? 0));
  const temp = Math.max(...window.map((s) => s.tempC ?? -99));

  // Chart geometry: one axis (mm/h), bars from the baseline, the IP54 limit as a labeled rule.
  const PAD_L = 34, PAD_B = 22, top = 10;
  const yMax = Math.max(LIMIT * 2, ...hours.map((h) => h.rain ?? 0)) * 1.1;
  const top3 = Math.floor(yMax / 1.1);
  const ticks = top3 > LIMIT * 1.4 ? [0, LIMIT, top3] : [0, LIMIT];
  // SVG text scales with the viewBox, so the viewBox width is close to the drawn width: labels land near 12 px on a phone and on a desktop card.
  const chart = (W: number, H: number, className: string) => {
    const y = (mm: number) => top + (H - PAD_B - top) * (1 - mm / yMax);
    const slot = (W - PAD_L) / HOURS;
    const barW = Math.min(28, slot - 6);
    const go = nextGo && nextGo.getTime() < hours[HOURS - 1].at.getTime() + 3600000 ? PAD_L + ((nextGo.getTime() - hours[0].at.getTime()) / 3600000) * slot : null;
    return (
      <svg viewBox={`0 0 ${W} ${H + 26}`} className={cn("w-full", className)} role="img" aria-label={`Rain forecast for the next ${HOURS} hours against Spot's IP54 limit of ${LIMIT} mm per hour. Hourly values are in Details and data.`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD_L} x2={W} y1={y(v)} y2={y(v)} stroke="#ffffff" strokeOpacity={v === LIMIT ? 0 : 0.07} />
            <text x={PAD_L - 6} y={y(v) + 4} textAnchor="end" fontSize="12" fill="#8d8d8d" className="font-mono">
              {v}
            </text>
          </g>
        ))}
        {hours.map((h, i) => {
          const x = PAD_L + i * slot + (slot - barW) / 2;
          const mm = h.rain ?? 0;
          const b = band(h.rain);
          return (
            <g key={h.at.toISOString()}>
              <title>{`${et(h.at, { hour: "numeric" })}: ${h.rain === null ? "no data" : `${h.rain.toFixed(1)} mm/h`}${h.thunder !== null ? `, thunder ${Math.round(h.thunder)}%` : ""} (${BAND[b].label})`}</title>
              {/* Wide invisible hit target for the tooltip. */}
              <rect x={PAD_L + i * slot} y={top} width={slot} height={H - PAD_B - top} fill="transparent" />
              <rect x={x} y={Math.min(y(mm), y(0) - 3)} width={barW} height={Math.max(3, y(0) - y(mm))} rx="4" className={BAND[b].fill} />
              {i % 2 === 0 && (
                <text x={x + barW / 2} y={H - 4} textAnchor="middle" fontSize="12" fill="#8d8d8d" className="font-mono">
                  {i === 0 ? "now" : et(h.at, { hour: "numeric" }).replace(" ", "").toLowerCase()}
                </text>
              )}
              {/* Thunder strip under the axis: its own row, not a second scale. */}
              <rect x={x} y={H + 6} width={barW} height="8" rx="2" className={h.thunder === null ? "fill-white/5" : h.thunder >= LIMITS.thunderPct ? "fill-hold" : "fill-white/10"} />
            </g>
          );
        })}
        <line x1={PAD_L} x2={W} y1={y(LIMIT)} y2={y(LIMIT)} stroke="var(--recall)" strokeWidth="2" strokeDasharray="6 4" />
        <text x={W - 4} y={y(LIMIT) - 6} textAnchor="end" fontSize="12" fill="var(--recall)" className="font-mono">
          IP54 limit {LIMIT} mm/h
        </text>
        {go !== null && (
          <g>
            <line x1={go} x2={go} y1={top} y2={H - PAD_B} stroke="var(--go)" strokeWidth="2" />
            <text x={go + 5} y={top + 12} fontSize="12" fill="var(--go)" className="font-mono">
              next safe launch
            </text>
          </g>
        )}
      </svg>
    );
  };

  return (
    <Card className="animate-rise">
      <CardHeader>
        <CardTitle>Rain vs Spot&apos;s IP54 limit</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <div className="space-y-3">
            <VerdictBlock verdict={verdict} caption={verdict === "RECALL" ? "Spot on route: bring it back to the dock" : verdict === "HOLD" ? "Hold Spot where it is" : "Spot on route keeps going"} />
            <p className="text-sm">
              <span className={cn("font-mono text-2xl font-medium tabular-nums", BAND[band(peak)].text)}>{peak.toFixed(1)}</span>
              <span className="text-muted-foreground"> mm/h before Spot can dock · limit {LIMIT}</span>
              {peak >= LIMIT && <span className="block text-recall">{(peak / LIMIT).toFixed(1)}x what IP54 is built for</span>}
            </p>
            <div className="keep-grid grid grid-cols-3 gap-2 text-sm">
              {[
                { Icon: CloudLightning, label: "Thunder", value: `${Math.round(thunder)}%`, bad: thunder >= LIMITS.thunderPct },
                { Icon: Wind, label: "Gusts", value: `${Math.round(gust)} km/h`, bad: gust >= LIMITS.gustKmh },
                { Icon: Thermometer, label: "Heat", value: temp > -99 ? `${Math.round(temp)} °C` : "--", bad: temp >= LIMITS.maxTempC - LIMITS.tempMarginC },
              ].map(({ Icon, label, value, bad }) => (
                <div key={label} className={cn("rounded-lg px-3 py-2 ring-1", bad ? "bg-recall/10 ring-recall/40" : "bg-black/20 ring-white/[0.06]")}>
                  <Icon aria-hidden className={cn("size-4", bad ? "text-recall" : "text-muted-foreground")} />
                  <p className="mt-1 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">{label}</p>
                  <p className={cn("font-medium tabular-nums", bad && "text-recall")}>{value}</p>
                </div>
              ))}
            </div>
          </div>
          <figure className="space-y-2">
            {chart(340, 190, "md:hidden")}
            {chart(470, 230, "hidden md:block")}
            <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {(["dry", "light", "heavy"] as const).map((b) => (
                <span key={b} className="inline-flex items-center gap-1.5">
                  <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden>
                    <rect width="10" height="10" rx="2" className={BAND[b].fill} />
                  </svg>
                  {BAND[b].label}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5">
                <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden>
                  <rect width="10" height="10" rx="2" className="fill-hold" />
                </svg>
                Thunder risk (strip under the bars)
              </span>
            </figcaption>
          </figure>
        </div>
        <Why label="Details and data">
          <p>Spot is rated IP54: splashes and light rain only. Above {LIMIT} mm/h (the end of &ldquo;light rain&rdquo;) Kairos holds a launch and recalls a Spot on route. Thunder risk at or above {LIMITS.thunderPct}% does the same (our assumption: lightning).</p>
          {verdict === "RECALL" && <p className="font-mono">Orbit call: {ORBIT_CALL.RECALL}</p>}
          {reasons.map((r) => (
            <p key={r.text}>
              {r.text}: {r.source}
            </p>
          ))}
          <table className="mt-2 w-full text-left font-mono text-[11px]">
            <thead>
              <tr className="text-muted-foreground">
                <th className="font-normal">Hour</th>
                <th className="font-normal">Rain mm/h</th>
                <th className="font-normal">Thunder %</th>
              </tr>
            </thead>
            <tbody>
              {hours.map((h) => (
                <tr key={h.at.toISOString()}>
                  <td>{et(h.at, { hour: "numeric" })}</td>
                  <td>{h.rain === null ? "--" : h.rain.toFixed(1)}</td>
                  <td>{h.thunder === null ? "--" : Math.round(h.thunder)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Why>
      </CardContent>
    </Card>
  );
}
