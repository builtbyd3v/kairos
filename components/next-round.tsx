import { CloudLightning, Thermometer, Wind } from "lucide-react";
import { analyze, pct, type Kit } from "@/lib/kit";
import { decide, ORBIT_CALL } from "@/lib/verdict";
import { getLiveWeather, SITE } from "@/lib/weather";
import { logDecision } from "@/lib/decisions";
import { drainPerMin, isOutdoor, routeOf } from "@/lib/route";
import { ReasonList, VerdictBlock } from "@/components/status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const et = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleString("en-US", { timeZone: "America/New_York", ...opts });

// Rounds launch at 02:00, 10:00 and 18:00 plant time, as in the kit's mission schedule.
function nextRoundStart(now: Date): Date {
  const wall = new Date(et(now, {}));
  const offset = now.getTime() - wall.getTime();
  for (let day = 0; day < 2; day++) {
    for (const hour of [2, 10, 18]) {
      const c = new Date(wall);
      c.setDate(c.getDate() + day);
      c.setHours(hour, 0, 0, 0);
      if (c > wall) return new Date(c.getTime() + offset);
    }
  }
  throw new Error("unreachable");
}

/** The verdict for the next scheduled round. Callers read the clock, so they sit behind connection() + Suspense. */
export async function planNextRound(kit: Kit, now: Date) {
  const weather = await getLiveWeather();
  // note: the next round repeats the latest kit route and starts at that mission's battery; the kit has no live telemetry.
  const last = kit.missions.at(-1)!;
  const route = routeOf(kit, last.id);
  const minutes = last.durationMin;
  const start = nextRoundStart(now);
  const end = new Date(start.getTime() + minutes * 60000);
  const drain = drainPerMin(kit, last.config);
  const routeRisk = analyze(kit)
    .sites.filter((s) => route.includes(s.id))
    .map((s) => ({ locationId: s.id, name: s.name, successPct: pct(s.ok, s.total) }))
    .sort((x, y) => x.successPct - y.successPct)
    .slice(0, 2);
  const health = { outdoor: isOutdoor(route), batteryPct: last.startBattery, projectedEndPct: last.startBattery - drain * minutes, routeRisk };
  const { verdict, reasons } = decide(weather, health, { now, start, end }, false);
  return { weather, last, route, minutes, start, health, verdict, reasons };
}

export type RoundPlan = Awaited<ReturnType<typeof planNextRound>>;

export function NextRound({ plan }: { plan: RoundPlan }) {
  const { verdict, reasons, last, route, minutes, start, health, weather } = plan;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Next round</CardTitle>
        <CardDescription>
          Launches {et(start, { weekday: "short", hour: "numeric", minute: "2-digit" })} ET · route of {last.id} ({route.length} stops,{" "}
          {health.outdoor ? "includes the outdoor leg at WP01" : "indoors only"}) · back on the dock about {minutes} min later at ~
          {Math.round(health.projectedEndPct)}% battery
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <VerdictBlock verdict={verdict} caption={verdict === "GO" ? "Safe to launch on schedule" : verdict === "HOLD" ? "Do not launch yet" : "Bring Spot back now"} />
        <ReasonList reasons={reasons.slice(0, 3)} />
        <form action={logDecision} className="flex flex-wrap gap-2">
          <input type="hidden" name="verdict" value={verdict} />
          <input type="hidden" name="source" value="live" />
          <input type="hidden" name="missionId" value={last.id} />
          <input type="hidden" name="reasons" value={JSON.stringify(reasons)} />
          <Button name="action" value="confirmed">
            Confirm {verdict}
          </Button>
          {verdict !== "GO" && (
            <Button name="action" value="overridden" variant="outline">
              Override, launch anyway
            </Button>
          )}
        </form>
        {ORBIT_CALL[verdict] && <p className="text-xs text-helper">On confirm: {ORBIT_CALL[verdict]} (simulated)</p>}
        <WeatherStrip weather={weather} />
      </CardContent>
    </Card>
  );
}

export function WeatherStrip({ weather }: { weather: RoundPlan["weather"] }) {
  if (!weather) return <p className="text-sm text-hold">Live weather is unavailable, so outdoor rounds hold until it returns.</p>;
  const hourly = weather.steps.filter((s) => s.tempC !== null).slice(0, 12);
  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">
        Live · {SITE.name.split(" (")[0]} · NWS + Open-Meteo · updated {et(new Date(weather.fetchedAt), { hour: "numeric", minute: "2-digit" })} ET
        {weather.alerts.length > 0 && <> · active: {weather.alerts.join(", ")}</>}
      </p>
      <div className="grid grid-cols-6 gap-1 text-center text-xs tabular-nums">
        {hourly.map((s) => (
          <div key={s.time} className="rounded bg-secondary/60 px-1 py-1.5">
            <div className="text-muted-foreground">{et(new Date(s.time), { hour: "numeric" })}</div>
            <div className="flex items-center justify-center gap-0.5 font-medium">
              <Thermometer aria-hidden className="size-3 text-helper" />
              {s.tempC === null ? "-" : `${Math.round(s.tempC)}°`}
            </div>
            <div className="flex items-center justify-center gap-0.5 text-muted-foreground">
              <CloudLightning aria-label="thunder chance" className="size-3" />
              {s.thunderPct ?? "-"}%
            </div>
            <div className="flex items-center justify-center gap-0.5 text-muted-foreground">
              <Wind aria-label="gust" className="size-3" />
              {s.gustKmh === null ? "-" : Math.round(s.gustKmh)}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-helper">Temperature °C · thunder chance · gusts km/h</p>
    </div>
  );
}
