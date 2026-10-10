import { cacheLife } from "next/cache";
import type { Weather, WeatherStep } from "./verdict";

// note: assumed site location (NextEra HQ, Juno Beach FL). The kit facility is fictional and has no coordinates.
export const SITE = { name: "Juno Beach, FL (assumed site)", lat: 26.8806, lon: -80.0575, nwsGrid: "MFL/110,99" };

const NWS_HEADERS = { "User-Agent": "spot-ops-hackathon (knight-hacks-ix demo)", Accept: "application/geo+json" };
const HOURS_AHEAD = 12; // rounds run every 8 hours, so this always covers the next one

type NwsLayer = { values: { validTime: string; value: number | null }[] };

// NWS grid values cover periods like "2026-10-10T00:00:00+00:00/PT6H". Return the value covering hour `t`, per hour.
function at(layer: NwsLayer | undefined, t: number, perHour = false): number | null {
  for (const { validTime, value } of layer?.values ?? []) {
    const [start, duration] = validTime.split("/");
    const hours = Number(duration.match(/(\d+)H/)?.[1] ?? 0) + 24 * Number(duration.match(/(\d+)D/)?.[1] ?? 0);
    const from = new Date(start).getTime();
    if (t >= from && t < from + hours * 3600000) return value === null ? null : perHour ? value / hours : value;
  }
  return null;
}

/** Live conditions for the site: NWS alerts + hourly grid, with Open-Meteo 15-minute rain for the next 2 hours. */
export async function getLiveWeather(): Promise<Weather | null> {
  "use cache";
  cacheLife("minutes");

  try {
    const [alertsRes, gridRes, meteoRes] = await Promise.all([
      fetch(`https://api.weather.gov/alerts/active?point=${SITE.lat},${SITE.lon}`, { headers: NWS_HEADERS }),
      fetch(`https://api.weather.gov/gridpoints/${SITE.nwsGrid}`, { headers: NWS_HEADERS }),
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${SITE.lat}&longitude=${SITE.lon}&minutely_15=precipitation&forecast_minutely_15=8&timezone=GMT`),
    ]);
    if (!alertsRes.ok || !gridRes.ok) return null;

    const alerts: { features: { properties: { event: string } }[] } = await alertsRes.json();
    const grid: { properties: Record<string, NwsLayer> } = await gridRes.json();
    const meteo: { minutely_15?: { time: string[]; precipitation: (number | null)[] } } | null = meteoRes.ok ? await meteoRes.json() : null;

    const p = grid.properties;
    const now = Date.now();
    const hourStart = now - (now % 3600000);
    const steps: WeatherStep[] = [];
    for (let h = 0; h < HOURS_AHEAD; h++) {
      const t = hourStart + h * 3600000;
      steps.push({
        time: new Date(t).toISOString(),
        precipMmPerHour: at(p.quantitativePrecipitation, t, true),
        thunderPct: at(p.probabilityOfThunder, t),
        gustKmh: at(p.windGust, t),
        tempC: at(p.temperature, t),
      });
    }
    // Open-Meteo gives rain in mm per 15 minutes; x4 converts to mm/h. It replaces the coarser NWS amount where both exist.
    meteo?.minutely_15?.time.forEach((time, i) => {
      const mm = meteo.minutely_15?.precipitation[i];
      if (mm == null) return;
      steps.push({ time: new Date(`${time}Z`).toISOString(), precipMmPerHour: mm * 4, thunderPct: null, gustKmh: null, tempC: null });
    });
    steps.sort((a, b) => a.time.localeCompare(b.time));

    return { fetchedAt: new Date(now).toISOString(), alerts: alerts.features.map((f) => f.properties.event), steps };
  } catch {
    // Network failure: the dispatcher treats null as unknown weather and holds.
    return null;
  }
}
