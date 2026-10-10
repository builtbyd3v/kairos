import { Suspense } from "react";
import { CloudAlert, CloudOff, TriangleAlert } from "lucide-react";
import { HOLD_ALERTS, RECALL_ALERTS } from "@/lib/verdict";
import { getLiveWeather, SITE } from "@/lib/weather";
import { cn } from "@/lib/utils";

/** Plant-wide strip under the page header: active NWS alerts that gate outdoor rounds, or missing live weather. */
export function WeatherBanner() {
  return (
    <Suspense fallback={null}>
      <Banner />
    </Suspense>
  );
}

async function Banner() {
  const weather = await getLiveWeather();
  if (!weather)
    return (
      <div role="status" className="flex items-center gap-2 border-b border-border bg-secondary/40 px-8 py-2.5 text-sm text-muted-foreground">
        <CloudOff aria-hidden className="size-4 shrink-0" />
        Live weather unavailable: outdoor rounds hold until it returns.
      </div>
    );

  const warnings = weather.alerts.filter((a) => RECALL_ALERTS.includes(a));
  const events = [...new Set([...warnings, ...weather.alerts.filter((a) => HOLD_ALERTS.includes(a))])];
  if (events.length === 0) return null;
  const red = warnings.length > 0;
  const Icon = red ? TriangleAlert : CloudAlert;
  return (
    <div
      role="status"
      className={cn("flex items-center gap-2 border-b px-8 py-2.5 text-sm font-medium", red ? "border-recall/40 bg-recall/15 text-recall" : "border-hold/40 bg-hold/10 text-hold")}
    >
      <Icon aria-hidden className={cn("size-4 shrink-0 rounded-full", red && "animate-pulse-soft")} />
      NWS {events.join(", ")} in effect for {SITE.name}. Outdoor rounds hold.
    </div>
  );
}
