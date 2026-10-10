"use client";

import { useState } from "react";
import { CloudRain, DoorOpen, ScanEye } from "lucide-react";
import { classifyDoor, DOOR_RAIN_MODEL_ID, DOOR_RAIN_THRESHOLD, doorVerdict, type DoorInput } from "@/lib/door-rain";
import { VerdictChip } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// note: no camera at a NextEra dock door in the kit, so the frames are public photos (CC0). Labeled in the UI.
const FRAMES = {
  dry: { src: "/door/door-dry.jpg", credit: "Weather-Time road photo (Kaggle, CC0), a source the model never trained on" },
  rain: { src: "/door/door-rain.jpg", credit: "Weather Image Recognition rain photo (Kaggle, CC0), calibration split, not trained on" },
};
type Camera = { key: keyof typeof FRAMES; pRain?: number; ms?: number; failed?: boolean };

const yesNo = (v: boolean | null) => (v === null ? "unknown" : v ? "yes" : "no");

/** The dock door check: Spot leaves only if the camera and the weather both say dry. Any rain or any unknown holds. */
export function DockDoor({ weather, source }: { weather: DoorInput["weather"]; source: string }) {
  const [frame, setFrame] = useState<keyof typeof FRAMES>("dry");
  const [camera, setCamera] = useState<Camera | null>(null);
  const [busy, setBusy] = useState(false);

  const shown = camera?.key === frame ? camera : null;
  const status: DoorInput["camera"]["status"] = shown?.failed ? "error" : shown?.pRain !== undefined ? "ok" : "stale";
  const result = doorVerdict({ camera: { pRain: shown?.pRain ?? null, status }, weather });

  const check = (key: keyof typeof FRAMES) => {
    setFrame(key);
    setBusy(true);
    classifyDoor(FRAMES[key].src).then(
      (r) => setCamera({ key, ...r }),
      () => setCamera({ key, failed: true }),
    ).finally(() => setBusy(false));
  };

  return (
    <Card className="animate-rise">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DoorOpen aria-hidden className="size-5 text-primary" /> Dock door
          <VerdictChip verdict={result.verdict} className="ml-auto" />
        </CardTitle>
        <CardDescription>Before Spot walks out: the door camera and the live weather both have to say dry. Any rain, or anything unknown, holds Spot inside.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-lg ring-1 ring-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- local sample frame, no optimization needed */}
            <img src={FRAMES[frame].src} alt={frame === "rain" ? "Door camera sample: rainy street" : "Door camera sample: dry road"} className="aspect-video w-full object-cover" />
            <span className="absolute top-2 left-2 rounded bg-background/80 px-1.5 py-0.5 font-mono text-[11px] tracking-wide">DOOR CAM · SAMPLE</span>
            {shown?.pRain !== undefined && (
              <div className="absolute inset-x-2 bottom-2 rounded bg-background/85 px-2 py-1.5">
                <div className="flex justify-between font-mono text-[11px] tabular-nums">
                  <span>p(rain) {shown.pRain.toFixed(2)}</span>
                  <span className="text-helper">hold at {DOOR_RAIN_THRESHOLD}</span>
                </div>
                <meter min={0} max={1} low={DOOR_RAIN_THRESHOLD} high={DOOR_RAIN_THRESHOLD} optimum={0} value={shown.pRain} className="mt-1 block h-1.5 w-full" aria-label="Door camera rain probability" />
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={frame === "dry" ? "secondary" : "outline"} disabled={busy} onClick={() => check("dry")}>
              <ScanEye aria-hidden /> Check dry frame
            </Button>
            <Button size="sm" variant={frame === "rain" ? "secondary" : "outline"} disabled={busy} onClick={() => check("rain")}>
              <CloudRain aria-hidden /> Check rain frame
            </Button>
          </div>
          <p className="text-xs text-helper">
            {busy ? "Running the door model in your browser…" : shown?.ms !== undefined ? `${shown.ms} ms in browser · ` : ""}
            Frame: {FRAMES[frame].credit}.
          </p>
        </div>
        <div className="space-y-3 text-sm">
          <dl className="panel-inset grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-4 py-3 [&_dt]:font-mono [&_dt]:text-[11px] [&_dt]:tracking-wider [&_dt]:uppercase">
            <dt className="text-muted-foreground">Camera</dt>
            <dd className={cn(status !== "ok" && "text-hold")}>
              {status === "ok" ? (shown!.pRain! >= DOOR_RAIN_THRESHOLD ? "rain" : "no rain") : status === "error" ? "model failed" : "not checked yet"}
            </dd>
            <dt className="text-muted-foreground">Rain now</dt>
            <dd className={cn(weather.observedRain !== false && "text-hold")}>{yesNo(weather.observedRain)}</dd>
            <dt className="text-muted-foreground">Next hour</dt>
            <dd className={cn(weather.forecastRain !== false && "text-hold")}>{yesNo(weather.forecastRain)}</dd>
          </dl>
          <ul className="space-y-1">
            {result.reasons.map((r) => (
              <li key={r} className={cn(result.verdict === "HOLD" ? "text-foreground" : "text-muted-foreground")}>
                {r}
              </li>
            ))}
          </ul>
          <p className="text-xs text-helper">
            Weather: {source}. Camera model:{" "}
            <a className="text-link underline-offset-4 hover:underline" href={`https://huggingface.co/${DOOR_RAIN_MODEL_ID}`}>
              {DOOR_RAIN_MODEL_ID}
            </a>
            . On photos from a camera it never trained on, it is close to a coin flip, so it can only add caution: it never turns a weather HOLD into GO. Not yet tested on a Spot door view.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
