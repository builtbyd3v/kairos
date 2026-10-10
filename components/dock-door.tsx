"use client";

import { useState } from "react";
import { Camera, CloudRain, DoorClosed, DoorOpen, Timer } from "lucide-react";
import { classifyDoor, DOOR_RAIN_MODEL_ID, DOOR_RAIN_THRESHOLD, doorVerdict, type DoorInput } from "@/lib/door-rain";
import { detectWater, WATER_MODEL_ID, type WaterDetection } from "@/lib/water-model";
import { waterLikelihood } from "@/lib/water-confidence";
import { DockScene } from "@/components/dock-scene";
import { VerdictBlock } from "@/components/status";
import { Why } from "@/components/why";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// note: no camera at a NextEra dock door in the kit, so the frames are public example photos (CC0).
const FRAMES = {
  dry: { src: "/door/door-dry2.jpg", w: 960, h: 540, credit: "UT Austin SCAND, Spot camera just outside a building (CC0), held out" },
  rain: { src: "/door/door-wet.jpg", w: 608, h: 608, credit: "Kaggle Dist-YOLO road shoulder by shops (CC0), held out" },
};
// Water boxes gate the door; the rain classifier's score is shown as advice only.
type Camera = { key: keyof typeof FRAMES; boxes?: WaterDetection[]; pRain?: number; ms?: number; failed?: boolean };

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
  const status: DoorInput["camera"]["status"] = shown?.failed ? "error" : shown?.boxes ? "ok" : "stale";
  const wet = shown?.boxes ? shown.boxes.length > 0 : null;
  const result = doorVerdict({ camera: { wetGround: wet, status }, weather });
  const f = FRAMES[frame];

  const check = (key: keyof typeof FRAMES) => {
    setFrame(key);
    setBusy(true);
    const started = performance.now();
    // The rain classifier is advisory, so its failure must not block the water check.
    Promise.all([detectWater(FRAMES[key].src), classifyDoor(FRAMES[key].src).catch(() => null)])
      .then(
        ([boxes, rain]) => setCamera({ key, boxes, pRain: rain?.pRain, ms: Math.round(performance.now() - started) }),
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
      <CardContent className="flex flex-1 flex-col gap-4">
        {/* Scene on top, full width; the call and its evidence underneath. */}
        <div className="relative aspect-[16/7] overflow-hidden rounded-lg bg-[#1f1f1f] ring-1 ring-border">
          <DockScene go={result.verdict === "GO"} rainNow={weather.observedRain} rainSoon={weather.forecastRain} wetGround={wet} />
          <div className="absolute top-2 right-2 flex gap-1 rounded-lg bg-background/70 p-0.5 backdrop-blur">
            <Button size="sm" variant={frame === "dry" ? "secondary" : "ghost"} disabled={busy} onClick={() => check("dry")}>
              Door cam: dry
            </Button>
            <Button size="sm" variant={frame === "rain" ? "secondary" : "ghost"} disabled={busy} onClick={() => check("rain")}>
              Door cam: wet
            </Button>
          </div>
        </div>
        <div className="grid flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <VerdictBlock
            verdict={result.verdict}
            caption={
              result.verdict === "GO"
                ? "Spot can walk out"
                : weather.observedRain
                  ? "Raining at the plant now"
                  : weather.forecastRain
                    ? "Rain in the next hour"
                    : wet
                      ? "Wet ground at the door"
                      : "Check the door camera"
            }
          />
          <div className="space-y-2">
          <div className="keep-grid grid grid-cols-3 gap-2">
            <Tile Icon={Camera} label="Ground" value={status === "ok" ? (wet ? "Wet" : "Dry") : busy ? "Checking" : "Not checked"} ok={status === "ok" && !wet} />
            <Tile Icon={CloudRain} label="Rain now" value={word(weather.observedRain, "Raining")} ok={weather.observedRain === false} />
            <Tile Icon={Timer} label="Next hour" value={word(weather.forecastRain, "Rain")} ok={weather.forecastRain === false} />
          </div>
          {/* The real door-camera frame, with the water model's boxes. */}
          <div className="flex items-center gap-3 rounded-lg bg-black/40 p-2 ring-1 ring-white/[0.06]">
            <div className={cn("relative h-20 shrink-0 overflow-hidden rounded", f.w === f.h ? "aspect-square" : "aspect-video")}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local example frame */}
              <img src={f.src} alt={frame === "rain" ? "Door camera: puddles outside" : "Door camera: dry walkway"} className="absolute inset-0 size-full object-cover" />
              <svg viewBox={`0 0 ${f.w} ${f.h}`} aria-hidden className="absolute inset-0 size-full">
                {shown?.boxes?.map((d, i) => (
                  <rect key={i} x={d.box.x * f.w} y={d.box.y * f.h} width={d.box.w * f.w} height={d.box.h * f.h} rx="10" fill="#6ea8fe" fillOpacity="0.12" stroke="#8ab8ff" strokeWidth={f.w / 90} />
                ))}
              </svg>
            </div>
            <div className="min-w-0 text-sm">
              <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">Door cam</p>
              <p>
                {busy
                  ? "Checking…"
                  : shown?.boxes
                    ? shown.boxes.length
                      ? `Water ${waterLikelihood(Math.max(...shown.boxes.map((b) => b.score)))?.pct ?? ""}% likely · ${shown.ms} ms`
                      : `No water · ${shown.ms} ms`
                    : "Not checked"}
              </p>
            </div>
          </div>
          </div>
          <Why>
            <p>Rule: rain now, rain in the next hour, wet ground at the door, or anything unknown holds Spot inside.</p>
            <p>Weather: {source}.</p>
            <p>
              Ground: water detector{" "}
              <a className="text-link underline-offset-4 hover:underline" href={`https://huggingface.co/${WATER_MODEL_ID}`}>
                {WATER_MODEL_ID}
              </a>
              . &ldquo;Rain look&rdquo; is advice from{" "}
              <a className="text-link underline-offset-4 hover:underline" href={`https://huggingface.co/${DOOR_RAIN_MODEL_ID}`}>
                {DOOR_RAIN_MODEL_ID}
              </a>{" "}
              (holds at {DOOR_RAIN_THRESHOLD} if it gated): close to a coin flip on cameras it never trained on, so it never decides.
            </p>
            <p>Frame: {FRAMES[frame].credit}.</p>
          </Why>
        </div>
      </CardContent>
    </Card>
  );
}
