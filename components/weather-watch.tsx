import { Suspense } from "react";
import { connection } from "next/server";
import { CloudLightning, CloudSun, TriangleAlert } from "lucide-react";
import { decide, ORBIT_CALL } from "@/lib/verdict";
import { getLiveWeather, SITE } from "@/lib/weather";
import { WeatherStrip } from "@/components/next-round";
import { RainRadar } from "@/components/rain-radar";
import { VerdictChip } from "@/components/status";
import { cn } from "@/lib/utils";
import { Why } from "@/components/why";

const ROUND_MIN = 30; // ASSUMPTION: Spot needs up to 30 min to finish or return; the window the watch checks

/** Mid-round weather watch: re-checks live weather as if Spot were out right now, and shows the recall Kairos would recommend. */
export function WeatherWatch() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Checking live weather…</p>}>
      <Watch />
    </Suspense>
  );
}

async function Watch() {
  await connection();
  const now = new Date();
  const weather = await getLiveWeather();
  // Weather only: full battery and no route risk, so the verdict here is the weather's alone.
  const health = { outdoor: true, batteryPct: 100, projectedEndPct: 100, routeRisk: [] };
  const { verdict, reasons } = decide(weather, health, { now, start: now, end: new Date(now.getTime() + ROUND_MIN * 60000) }, true);
  const top = reasons.find((r) => r.verdict === verdict) ?? reasons[0];
  const Icon = verdict === "RECALL" ? TriangleAlert : verdict === "HOLD" ? CloudLightning : CloudSun;
  return (
    <section aria-label="Weather watch" className="space-y-3">
      <div
        role="status"
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-xl px-5 py-4 text-sm ring-1",
          verdict === "RECALL" ? "bg-recall/15 ring-recall/50" : verdict === "HOLD" ? "bg-hold/10 ring-hold/40" : "bg-card ring-foreground/10",
        )}
      >
        <Icon aria-hidden className={cn("size-5 shrink-0", verdict === "RECALL" ? "animate-pulse-soft text-recall" : verdict === "HOLD" ? "text-hold" : "text-go")} />
        <VerdictChip verdict={verdict} />
        <p className="min-w-0 flex-1 text-base">
          <span className="font-semibold">{verdict === "RECALL" ? "Bring Spot home" : verdict === "HOLD" ? "Hold Spot" : "Weather is clear"}</span>
          <span className="text-muted-foreground"> · {top?.text.split(";")[0] ?? "nothing before Spot can dock"}</span>
        </p>
        <Why label="Details">
          <p>Live weather at {SITE.name.split(" (")[0]}, checked as if Spot were out now ({ROUND_MIN} min to dock).</p>
          {verdict === "RECALL" && <p className="font-mono">Orbit call: {ORBIT_CALL.RECALL}</p>}
          {reasons.map((r) => (
            <p key={r.text}>
              {r.text}: {r.source}
            </p>
          ))}
        </Why>
      </div>
      <div className="grid items-start gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <RainRadar stamp={Math.floor(now.getTime() / 300000)} label="Live rain radar around the St. Lucie plant" />
        <WeatherStrip weather={weather} />
      </div>
    </section>
  );
}
