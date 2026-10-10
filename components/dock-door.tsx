"use client";

import { useState } from "react";
import { Camera, CloudRain, DoorClosed, DoorOpen, Timer } from "lucide-react";
import { classifyDoor, DOOR_RAIN_MODEL_ID, DOOR_RAIN_THRESHOLD, doorVerdict, type DoorInput } from "@/lib/door-rain";
import { VerdictBlock } from "@/components/status";
import { Why } from "@/components/why";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// note: no camera at a NextEra dock door in the kit, so the frames are public example photos (CC0).
const FRAMES = {
  dry: { src: "/door/door-dry.jpg", credit: "Weather-Time road photo (Kaggle, CC0), a source the model never trained on" },
  rain: { src: "/door/door-rain.jpg", credit: "Weather Image Recognition rain photo (Kaggle, CC0), calibration split, not trained on" },
};
type Camera = { key: keyof typeof FRAMES; pRain?: number; ms?: number; failed?: boolean };

/** One status tile: icon, label, and a word that is green when dry and amber otherwise. */
function Tile({ Icon, label, value, ok }: { Icon: typeof Camera; label: string; value: string; ok: boolean }) {
  return (
    <div className={cn("rounded-lg px-3 py-2.5 ring-1", ok ? "bg-go/10 ring-go/30" : "bg-hold/10 ring-hold/40")}>
      <Icon aria-hidden className={cn("size-4", ok ? "text-go" : "text-hold")} />
      <p className="mt-1.5 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className={cn("text-sm font-medium", ok ? "text-go" : "text-hold")}>{value}</p>
    </div>
  );
}

const word = (v: boolean | null, yes: string) => (v === null ? "Unknown" : v ? yes : "Dry");

/** The dock door check: Spot leaves only if the camera and the weather both say dry. Any rain or any unknown holds. */
export function DockDoor({ weather, source }: { weather: DoorInput["weather"]; source: string }) {
  const [frame, setFrame] = useState<keyof typeof FRAMES>("dry");
  const [camera, setCamera] = useState<Camera | null>(null);
  const [busy, setBusy] = useState(false);

  const shown = camera?.key === frame ? camera : null;
  const status: DoorInput["camera"]["status"] = shown?.failed ? "error" : shown?.pRain !== undefined ? "ok" : "stale";
  const result = doorVerdict({ camera: { pRain: shown?.pRain ?? null, status }, weather });
  const camRain = status === "ok" && shown!.pRain! >= DOOR_RAIN_THRESHOLD;

  const check = (key: keyof typeof FRAMES) => {
    setFrame(key);
    setBusy(true);
    classifyDoor(FRAMES[key].src)
      .then(
        (r) => setCamera({ key, ...r }),
        () => setCamera({ key, failed: true }),
      )
      .finally(() => setBusy(false));
  };
  const Door = result.verdict === "GO" ? DoorOpen : DoorClosed;

  return (
    <Card className="animate-rise">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Door aria-hidden className="size-5 text-primary" /> Dock door
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-lg ring-1 ring-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- local example frame */}
            <img src={FRAMES[frame].src} alt={frame === "rain" ? "Door camera: rainy street" : "Door camera: dry road"} className="aspect-video w-full object-cover" />
            <span className="absolute top-2 left-2 rounded bg-background/80 px-1.5 py-0.5 font-mono text-[11px] tracking-wide">DOOR CAM</span>
            {shown?.pRain !== undefined && (
              <div className="absolute inset-x-2 bottom-2 rounded bg-background/85 px-2 py-1.5">
                <div className="flex justify-between font-mono text-[11px] tabular-nums">
                  <span>rain {shown.pRain.toFixed(2)}</span>
                  <span className="text-helper">{shown.ms} ms</span>
                </div>
                <meter min={0} max={1} low={DOOR_RAIN_THRESHOLD} high={DOOR_RAIN_THRESHOLD} optimum={0} value={shown.pRain} className="mt-1 block h-1.5 w-full" aria-label="Door camera rain score" />
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant={frame === "dry" ? "secondary" : "ghost"} disabled={busy} onClick={() => check("dry")}>
              Dry frame
            </Button>
            <Button size="sm" variant={frame === "rain" ? "secondary" : "ghost"} disabled={busy} onClick={() => check("rain")}>
              Rain frame
            </Button>
          </div>
        </div>
        <div className="space-y-3">
          <VerdictBlock
            verdict={result.verdict}
            caption={
              result.verdict === "GO"
                ? "Spot can walk out"
                : weather.observedRain
                  ? "Raining at the plant now"
                  : weather.forecastRain
                    ? "Rain in the next hour"
                    : camRain
                      ? "Door camera sees rain"
                      : "Not sure it is dry: check the door"
            }
          />
          <div className="grid grid-cols-3 gap-2">
            <Tile Icon={Camera} label="Camera" value={status === "ok" ? (camRain ? "Rain" : "Dry") : busy ? "Checking" : "Not checked"} ok={status === "ok" && !camRain} />
            <Tile Icon={CloudRain} label="Rain now" value={word(weather.observedRain, "Raining")} ok={weather.observedRain === false} />
            <Tile Icon={Timer} label="Next hour" value={word(weather.forecastRain, "Rain")} ok={weather.forecastRain === false} />
          </div>
          <Why>
            <p>Rule: any rain or anything unknown holds Spot inside. The camera can add caution but never overrules the weather.</p>
            <p>Weather: {source}.</p>
            <p>
              Camera model:{" "}
              <a className="text-link underline-offset-4 hover:underline" href={`https://huggingface.co/${DOOR_RAIN_MODEL_ID}`}>
                {DOOR_RAIN_MODEL_ID}
              </a>
              , holds at {DOOR_RAIN_THRESHOLD}. Close to a coin flip on cameras it never trained on; not yet tested on a Spot door view.
            </p>
            <p>Frame: {FRAMES[frame].credit}.</p>
          </Why>
        </div>
      </CardContent>
    </Card>
  );
}
