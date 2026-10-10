import { CloudLightning, Thermometer, Wind } from "lucide-react";
import { analyze, pct, type Kit } from "@/lib/kit";
import { decide, ORBIT_CALL } from "@/lib/verdict";
import { SITE } from "@/lib/weather";
import { weatherNow } from "@/lib/scenario";
import { logDecision } from "@/lib/decisions";
import { drainPerMin, isOutdoor, OUTDOOR_WAYPOINTS, routeOf } from "@/lib/route";
import { ReasonList, VerdictBlock, VerdictChip } from "@/components/status";
import { Why } from "@/components/why";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const et = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleString("en-US", { timeZone: "America/New_York", ...opts });

// Rounds launch at 02:00, 10:00 and 18:00 plant time, as in the kit's mission schedule.
function nextRoundStart(now: Date): Date {
  const wall = new Date(et(now, {}));
  const offset = Math.round((now.getTime() - wall.getTime()) / 60000) * 60000; // whole minutes: the formatted wall clock drops milliseconds
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
  const { weather } = await weatherNow();
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
  const { verdict, reasons, indoorOnly } = decide(weather, health, { now, start, end }, false);
  return { weather, last, route, minutes, start, health, verdict, reasons, indoorOnly };
}

export type RoundPlan = Awaited<ReturnType<typeof planNextRound>>;

export function NextRound({ plan, strip = true, nextGo }: { plan: RoundPlan; strip?: boolean; nextGo?: Date | null }) {
  const { verdict, reasons, indoorOnly, last, route, minutes, start, health, weather } = plan;
  const kept = route.filter((id) => !OUTDOOR_WAYPOINTS.has(id)).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Next round</CardTitle>
        <CardDescription>
          {et(start, { weekday: "short", hour: "numeric", minute: "2-digit" })} ET · {route.length} stops · {minutes} min · docks at ~{Math.round(health.projectedEndPct)}%
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <VerdictBlock verdict={verdict} caption={verdict === "GO" ? "Safe to launch on schedule" : verdict === "HOLD" ? "Do not launch yet" : "Bring Spot back now"} />
        {verdict !== "GO" && nextGo !== undefined && (
          <p className="flex items-center gap-2 rounded-lg bg-go/10 px-3 py-2.5 text-sm ring-1 ring-go/40">
            <VerdictChip verdict="GO" />
            {nextGo ? (
              <span>
                Next safe launch <span className="font-mono font-semibold tabular-nums">{et(nextGo, { weekday: "short", hour: "numeric", minute: "2-digit" })} ET</span>
              </span>
            ) : (
              <span>No safe launch in the next 24 hours</span>
            )}
          </p>
        )}
        <ReasonList reasons={reasons.slice(0, 2)} />
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
        {indoorOnly && (
          <form action={logDecision} className="space-y-2 rounded-xl bg-go/10 p-3 ring-1 ring-go/40">
            <p className="text-sm">Weather only blocks the outdoor stop.</p>
            <input type="hidden" name="verdict" value="GO" />
            <input type="hidden" name="source" value="live" />
            <input type="hidden" name="missionId" value={last.id} />
            {/* The indoor-only reason goes first, so the log reads "Confirmed GO, indoor only". */}
            <input type="hidden" name="reasons" value={JSON.stringify([indoorOnly, ...reasons])} />
            <Button name="action" value="confirmed" variant="outline">
              Launch indoors only, skip {[...OUTDOOR_WAYPOINTS].join(", ")} ({kept} of {route.length} stops)
            </Button>
          </form>
        )}
        {ORBIT_CALL[verdict] && (
          <Why label="Orbit call">
            <code className="block font-mono break-all">{ORBIT_CALL[verdict]}</code>
          </Why>
        )}
        {strip && <WeatherStrip weather={weather} />}
      </CardContent>
    </Card>
  );
}

export function WeatherStrip({ weather }: { weather: RoundPlan["weather"] }) {
  if (!weather) return <p className="text-sm text-hold">Live weather is unavailable, so outdoor rounds hold until it returns.</p>;
  const hourly = weather.steps.filter((s) => s.tempC !== null).slice(0, 12);
  return (
    <div>
      <p className="mb-2 font-mono text-[11px] text-muted-foreground">
        Live · {SITE.name.split(" (")[0]} ·{" "}
        <a className="underline-offset-4 hover:underline" href="https://www.weather.gov/documentation/services-web-api">
          NWS
        </a>{" "}
        +{" "}
        <a className="underline-offset-4 hover:underline" href="https://open-meteo.com">
          Open-Meteo (CC BY 4.0)
        </a>{" "}
        · updated {et(new Date(weather.fetchedAt), { hour: "numeric", minute: "2-digit" })} ET
        {weather.alerts.length > 0 && <> · active: {weather.alerts.join(", ")}</>}
      </p>
      <div className="panel-inset grid grid-cols-6 gap-1 p-1.5 text-center font-mono text-xs tabular-nums">
        {hourly.map((s) => (
          <div key={s.time} className="rounded-md px-1 py-1.5 transition-colors hover:bg-white/[0.04]">
            <div className="text-[10px] text-helper uppercase">{et(new Date(s.time), { hour: "numeric" })}</div>
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
