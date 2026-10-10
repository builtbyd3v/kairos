// Which weather the app judges against: a recorded real storm (default, so a demo works whatever the sky does) or live feeds.
import { cookies } from "next/headers";
import snapshot from "@/data/demo/weather-snapshot.json";
import { getLiveWeather } from "./weather";
import type { Weather } from "./verdict";

export type Scenario = "recorded" | "live";
export const SCENARIO_COOKIE = "kairos_scenario";
/** When the recorded storm was captured (NWS + Open-Meteo + radar frames in public/demo/radar). */
export const RECORDED_AT = snapshot.recordedAt;

export async function getScenario(): Promise<Scenario> {
  return (await cookies()).get(SCENARIO_COOKIE)?.value === "live" ? "live" : "recorded";
}

/** Weather plus the clock it is judged against. Recorded: the snapshot and its own capture time, so every rule sees a consistent moment. */
export async function weatherNow(): Promise<{ weather: Weather | null; now: Date; scenario: Scenario }> {
  const scenario = await getScenario();
  if (scenario === "recorded") return { weather: snapshot.weather as unknown as Weather, now: new Date(snapshot.recordedAt), scenario };
  return { weather: await getLiveWeather(), now: new Date(), scenario };
}
