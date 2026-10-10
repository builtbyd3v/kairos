import { Suspense } from "react";
import { connection } from "next/server";
import { CloudLightning, CloudSun, TriangleAlert } from "lucide-react";
import { decide, ORBIT_CALL } from "@/lib/verdict";
import { SITE } from "@/lib/weather";
import { weatherNow } from "@/lib/scenario";
import { RainRadar } from "@/components/rain-radar";
import { VerdictChip } from "@/components/status";
import { cn } from "@/lib/utils";
import { loadKit } from "@/lib/kit";
import { forecast } from "@/lib/forecast";
import { et } from "@/components/next-round";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Why } from "@/components/why";

const ROUND_MIN = 30; // ASSUMPTION: Spot needs up to 30 min to finish or return; the window the watch checks

/** Radar card for the live round. Reads the clock (radar cache-buster), so it carries its own Suspense. */
export function LiveRadar() {
  return (
    <Suspense fallback={<Card className="aspect-square animate-pulse" />}>
      <RadarCard />
    </Suspense>
  );
}

async function RadarCard() {
  await connection();
  const { now, scenario } = await weatherNow();
  return (
    <Card className="animate-rise [--rise-delay:160ms]">
      <CardHeader>
        <CardTitle>Radar · last 50 min</CardTitle>
      </CardHeader>
      <CardContent>
        <RainRadar stamp={Math.floor(now.getTime() / 300000)} recorded={scenario === "recorded"} label="Rain radar around the St. Lucie plant" />
      </CardContent>
    </Card>
  );
}

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
  const [{ weather, now, scenario }, kit] = await Promise.all([weatherNow(), loadKit()]);
  // Recorded story: this is the round at the next safe launch (the storm has passed). Live: as if Spot were out right now.
  const at = scenario === "recorded" ? (forecast(weather, kit, now).nextGo ?? now) : now;
  // Weather only: full battery and no route risk, so the verdict here is the weather's alone.
  const health = { outdoor: true, batteryPct: 100, projectedEndPct: 100, routeRisk: [] };
  const { verdict, reasons } = decide(weather, health, { now, start: at, end: new Date(at.getTime() + ROUND_MIN * 60000) }, true);
  const when = et(at, { weekday: "short", hour: "numeric", minute: "2-digit" });
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
          <span className="text-muted-foreground">
            {" "}
            · {scenario === "recorded" ? `${when} ET round, after the storm` : (top?.text.split(";")[0] ?? "nothing before Spot can dock")}
          </span>
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
    </section>
  );
}
