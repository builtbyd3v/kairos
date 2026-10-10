"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BatteryLow,
  BatteryMedium,
  BatteryWarning,
  CircleCheck,
  CircleCheckBig,
  CircleX,
  Droplets,
  Flag,
  FlagTriangleRight,
  Footprints,
  OctagonAlert,
  Pause,
  Play,
  RotateCcw,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { checkFloor, floorModel, type FloorResult } from "@/lib/floor-model";
import { endOf, kitClock, kitDate, liveState, outdoorArrival, type EventType, type LiveAnomaly, type LiveEvent, type LiveReading, type Truth } from "@/lib/live";
import { FacilityMap, type MapSite } from "@/components/facility-map";
import { PageHeader } from "@/components/page-header";
import { SEVERITY_UI, TRUTH_UI, VerdictChip } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Mission = { id: string; name: string; config: string; plan: { id: string; locationId: string; type: string }[] };
type Props = {
  missions: Mission[];
  defaultId: string;
  events: LiveEvent[];
  anomalies: LiveAnomaly[];
  readings: LiveReading[];
  names: Record<string, string>;
  sites: MapSite[];
  dock: string;
  outdoor: string[];
};

const TICK_MS = 250;
const SPEEDS = [10, 30, 60]; // kit seconds per real second
const words = (s = "") => s.replaceAll("_", " ").toLowerCase();

const TRUTH_ICON: Record<Truth, typeof Flag> = { CLEAN: CircleCheckBig, DEGRADED: TriangleAlert, "NEEDS REVIEW": OctagonAlert };
const FEED: Record<EventType, { Icon: typeof Flag; label: string; tone: string }> = {
  MISSION_STARTED: { Icon: Flag, label: "Mission started", tone: "text-primary" },
  ACTION_STARTED: { Icon: Footprints, label: "Started", tone: "text-muted-foreground" },
  ACTION_COMPLETED: { Icon: CircleCheck, label: "OK", tone: "text-go" },
  ACTION_FAILED: { Icon: CircleX, label: "Failed", tone: "text-recall" },
  MISSION_COMPLETED: { Icon: FlagTriangleRight, label: "Mission reported", tone: "text-primary" },
};
// note: the kit has no camera frames, so the floor check runs on held-out sample images.
const FRAMES = { dry: "/samples/test-dry-public-space.jpg", wet: "/samples/test-wet-public-space.jpg" };
const SEGMENT = { pending: "bg-secondary", ok: "bg-go", failed: "bg-recall" };

export function LiveRound({ missions, defaultId, events: stream, anomalies, readings, names, sites, dock, outdoor }: Props) {
  const startOf = (id: string) => stream.find((e) => e.missionId === id)!.at;
  const [missionId, setMissionId] = useState(defaultId);
  const [t, setT] = useState(() => startOf(defaultId));
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(30);
  const [wetFrame, setWetFrame] = useState(false);
  const [progress, setProgress] = useState(0);
  const [floor, setFloor] = useState<{ key: string; result?: FloorResult; failed?: boolean } | null>(null);

  const mission = missions.find((m) => m.id === missionId)!;
  const events = useMemo(() => stream.filter((e) => e.missionId === missionId), [stream, missionId]);
  const start = events[0].at;
  const end = endOf(events);
  const running = playing && t < end;

  // Playback clock: the interval is the outside system. It stops itself at the mission's end.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setT((prev) => Math.min(end, prev + speed * TICK_MS)), TICK_MS);
    return () => clearInterval(id);
  }, [running, speed, end]);

  const s = liveState(events, t, anomalies, readings);
  const startedBy = new Map(events.filter((e) => e.type === "ACTION_STARTED").map((e) => [e.actionId, e]));
  const anomaliesBy = Map.groupBy(s.anomalies, (a) => a.actionId);
  const where = (e?: LiveEvent) => (e ? `${e.locationId} ${names[e.locationId!] ?? ""} · ${e.assetId} ${names[e.assetId!] ?? ""}` : "");
  const truth = TRUTH_UI[s.truth];
  const TruthIcon = TRUTH_ICON[s.truth];

  // Floor check: runs once Spot reaches the outdoor leg, again if the frame toggles. Never blocks playback.
  const arrival = outdoorArrival(s.events, outdoor);
  const frame = wetFrame ? FRAMES.wet : FRAMES.dry;
  const floorKey = arrival ? `${arrival.id}|${frame}` : null;
  useEffect(() => {
    if (!floorKey) return;
    let current = true;
    checkFloor(frame, setProgress).then(
      (result) => current && setFloor({ key: floorKey, result }),
      () => current && setFloor({ key: floorKey, failed: true }),
    );
    return () => {
      current = false;
    };
  }, [floorKey, frame]);
  const check = floor?.key === floorKey ? floor : undefined;
  const wet = check?.result !== undefined && check.result.pWet > 0.5;
  const hasOutdoorLeg = mission.plan.some((a) => outdoor.includes(a.locationId));
  // Pre-warm on the first playback control press, not on first paint, so the page stays fast.
  const warm = () => void floorModel(setProgress).catch(() => {});

  const pick = (id: string) => {
    warm();
    setMissionId(id);
    setT(startOf(id));
    setPlaying(true);
  };

  return (
    <>
      <PageHeader
        title="Live round"
        subtitle={`${mission.id} ${mission.name} · config ${mission.config} · started ${kitDate(start)} kit time`}
        actions={
          <span
            className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wide text-primary ring-1 ring-primary/40"
            title="Live (simulated from NextEra's replay stream)"
          >
            <span aria-hidden className={cn("size-2 rounded-full bg-recall", running && "animate-pulse motion-reduce:animate-none")} />
            LIVE · simulated
          </span>
        }
      />
      <main className="mx-auto max-w-[1440px] space-y-5 px-8 py-6">
        <Card>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Mission
                <select
                  value={missionId}
                  onChange={(e) => pick(e.target.value)}
                  className="h-8 rounded-lg bg-secondary px-2 text-sm text-foreground ring-1 ring-border focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {missions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id} · {m.name} · {m.config}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                onClick={() => {
                  if (!running) warm();
                  setPlaying((p) => !p);
                }} disabled={t >= end} aria-label={running ? "Pause playback" : "Play playback"}>
                {running ? <Pause aria-hidden /> : <Play aria-hidden />}
                {running ? "Pause" : t >= end ? "Ended" : "Play"}
              </Button>
              <div role="group" aria-label="Playback speed" className="flex gap-1">
                {SPEEDS.map((v) => (
                  <Button key={v} size="sm" variant={speed === v ? "secondary" : "ghost"} aria-pressed={speed === v} onClick={() => {
                      warm();
                      setSpeed(v);
                    }}
                  >
                    {v}x
                  </Button>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => pick(missionId)}>
                <RotateCcw aria-hidden /> Restart
              </Button>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={wetFrame}
                  onChange={(e) => setWetFrame(e.target.checked)}
                  className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-ring"
                />
                Simulate wet entrance
              </label>
              <span className="ml-auto font-mono text-2xl tabular-nums">{kitClock(t)}</span>
              <span className="text-xs text-helper">kit time · Live (simulated from NextEra&apos;s replay stream)</span>
            </div>
            <div>
              <ol aria-label="Mission actions" className="flex gap-0.5">
                {mission.plan.map((a, i) => {
                  const r = s.results[a.id] ?? "pending";
                  const text = `Action ${i + 1}, ${words(a.type)} at ${a.locationId}: ${r === "ok" ? "OK" : r}`;
                  return (
                    <li key={a.id} title={text} className={cn("h-2 flex-1 rounded-sm", SEGMENT[r], s.current?.actionId === a.id && "ring-2 ring-foreground/70")}>
                      <span className="sr-only">{text}</span>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-1.5 text-xs text-helper tabular-nums">
                {s.done} of {mission.plan.length} actions done · green OK, red failed, gray pending
              </p>
            </div>
          </CardContent>
        </Card>

        {s.phase === "done" && (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl bg-card px-5 py-4 ring-1 ring-foreground/10">
            <TruthIcon aria-hidden className={cn("size-5", truth.text)} />
            <p className="text-sm">
              Mission reported {s.reported} · actually <span className={cn("font-semibold", truth.text)}>{truth.label}</span>:{" "}
              <span className="tabular-nums">
                {s.failed} failed inspections, {s.anomalies.length} anomalies
              </span>
            </p>
            <Link href={`/missions/${mission.id}`} className="ml-auto inline-flex items-center gap-1 text-sm text-link hover:underline focus-visible:outline-2 focus-visible:outline-link">
              Open mission report <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
        )}
        {s.phase === "stream ended" && (
          <div role="alert" className="flex items-center gap-3 rounded-xl bg-recall/10 px-5 py-4 text-sm ring-1 ring-recall/50">
            <WifiOff aria-hidden className="size-5 text-recall" />
            <span>
              <span className="font-semibold text-recall">Stream ended mid-mission: no completion event received.</span> Last event at{" "}
              <span className="font-mono tabular-nums">{kitClock(events.at(-1)!.at)}</span>. Treat Spot&apos;s position and status as unknown.
            </span>
          </div>
        )}

        <div className="grid grid-cols-12 gap-5">
          <Card className="col-span-12 lg:col-span-8">
            <CardHeader>
              <CardTitle>Where Spot is now</CardTitle>
              <CardDescription>Planned route for {mission.id}; white marker = current waypoint</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FacilityMap sites={sites} route={mission.plan.map((a) => a.locationId)} spot={s.current?.locationId} outdoor={outdoor} dock={dock} />
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg bg-secondary px-4 py-3 text-sm">
                <span>
                  <span className="text-muted-foreground">Action </span>
                  {s.current ? words(s.current.actionType) : s.phase}
                </span>
                <span className="min-w-0 truncate">
                  <span className="text-muted-foreground">At </span>
                  {where(s.current) || "not started"}
                </span>
                <BatteryStatus pct={s.battery} className="ml-auto" />
              </div>
            </CardContent>
          </Card>

          <div className="col-span-12 space-y-5 lg:col-span-4">
            <Card>
              <CardHeader>
                <CardTitle>Now</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Phase</dt>
                  <dd className="capitalize">{s.phase}</dd>
                  <dt className="text-muted-foreground">Action</dt>
                  <dd className="capitalize">{s.current ? words(s.current.actionType) : "none yet"}</dd>
                  <dt className="text-muted-foreground">Last reading</dt>
                  <dd className="tabular-nums">
                    {s.lastReading ? (
                      <>
                        {words(s.lastReading.type)}: {s.lastReading.value} {s.lastReading.unit}{" "}
                        <span className={s.lastReading.quality === "GOOD" ? "text-muted-foreground" : "text-hold"}>({words(s.lastReading.quality)})</span>
                      </>
                    ) : (
                      "none yet"
                    )}
                  </dd>
                  <dt className="text-muted-foreground">Battery</dt>
                  <dd>
                    <BatteryStatus pct={s.battery} />
                  </dd>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>True status so far</CardTitle>
                <CardDescription>What the operator should believe, not what the robot reports</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Reported: </span>
                  {s.phase === "stream ended" ? "no signal" : words(s.reported)}
                </p>
                <p aria-live="polite" className={cn("flex items-center gap-2 text-xl font-semibold", truth.text)}>
                  <TruthIcon aria-hidden className="size-5" />
                  <span>
                    <span className="sr-only">As of now: </span>
                    {s.truth}
                  </span>
                </p>
                <p className="tabular-nums">
                  Failed <span className={s.failed ? "text-recall" : ""}>{s.failed}</span> of {s.done} inspections so far
                </p>
                <p className="tabular-nums">
                  <span className={s.serious ? "text-recall" : ""}>{s.serious}</span> serious anomalies (high or critical), {s.anomalies.length} total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Floor check</CardTitle>
                <CardDescription>Wet-floor model on the outdoor leg ({outdoor.join(", ")}, assumed outdoors)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-[11px] tracking-wider text-helper uppercase">Frame: sample image (the kit has no camera frames)</p>
                {/* eslint-disable-next-line @next/next/no-img-element -- local sample frame, no optimization needed */}
                <img src={frame} alt={wetFrame ? "Sample frame: wet entrance" : "Sample frame: dry entrance"} className="max-h-36 w-full rounded object-cover ring-1 ring-border" />
                <div aria-live="polite" className="space-y-2">
                  {!hasOutdoorLeg ? (
                    <p className="text-muted-foreground">This route has no outdoor leg. No floor check runs.</p>
                  ) : !arrival ? (
                    <p className="text-muted-foreground">Runs when Spot reaches {outdoor.join(", ")}.</p>
                  ) : check?.failed ? (
                    <p className="flex items-center gap-2 text-hold">
                      <TriangleAlert aria-hidden className="size-4" /> Floor model unavailable. Playback continues.
                    </p>
                  ) : !check?.result ? (
                    <label className="block space-y-1 text-muted-foreground">
                      {progress < 100 ? `Downloading floor model ${progress}%` : "Checking frame"}
                      <progress value={progress} max={100} className="block h-1.5 w-full accent-primary" />
                    </label>
                  ) : (
                    <>
                      <p className="font-mono tabular-nums">
                        p(wet) = {check.result.pWet.toFixed(2)} · {check.result.ms} ms in browser
                      </p>
                      {wet ? (
                        <p className="flex items-start gap-2">
                          <VerdictChip verdict="HOLD" /> Standing water at {arrival.locationId} entrance: hold this waypoint, operator confirms
                        </p>
                      ) : (
                        <p className="flex items-center gap-2 text-muted-foreground">
                          <Droplets aria-hidden className="size-4 text-helper" /> No water detected (advisory only)
                        </p>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Event feed</CardTitle>
                <CardDescription>Newest first</CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="max-h-96 space-y-1 overflow-y-auto pr-1">
                  {s.events.toReversed().map((e) => {
                    const ui = FEED[e.type];
                    const started = startedBy.get(e.actionId);
                    return (
                      <Fragment key={e.id}>
                        {wet && e.id === arrival?.id && (
                          <li className="animate-row flex gap-2.5 rounded-md bg-hold/10 px-2 py-1.5 text-sm">
                            <span className="pt-px font-mono text-xs text-helper tabular-nums">{kitClock(e.at)}</span>
                            <Droplets aria-hidden className="mt-0.5 size-4 shrink-0 text-hold" />
                            <p>
                              Floor check: possible standing water at {e.locationId}, p={check!.result!.pWet.toFixed(2)}
                            </p>
                          </li>
                        )}
                      <li className="animate-row flex gap-2.5 rounded-md px-2 py-1.5 text-sm odd:bg-secondary/40">
                        <span className="pt-px font-mono text-xs text-helper tabular-nums">{kitClock(e.at)}</span>
                        <ui.Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", ui.tone)} />
                        <div className="min-w-0">
                          <p className={cn(e.type === "ACTION_FAILED" && "text-recall")}>
                            {ui.label}
                            {e.type === "MISSION_COMPLETED" && ` ${e.status}`}
                            {e.type === "ACTION_FAILED" && `: ${words(e.failureType)}`}
                            {started && (
                              <span className="text-muted-foreground">
                                {" "}
                                · {words(started.actionType)} at {started.locationId} {started.assetId}
                              </span>
                            )}
                          </p>
                          {e.type !== "ACTION_STARTED" &&
                            anomaliesBy.get(e.actionId!)?.map((a) => (
                              <Link
                                key={a.id}
                                href="/anomalies"
                                className={cn(
                                  "mt-1 mr-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ring-1 hover:underline focus-visible:outline-2 focus-visible:outline-link",
                                  SEVERITY_UI[a.severity],
                                )}
                              >
                                <TriangleAlert aria-hidden className="size-3" />
                                {a.severity} · {words(a.type)}
                              </Link>
                            ))}
                        </div>
                      </li>
                      </Fragment>
                    );
                  })}
                </ol>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}

function BatteryStatus({ pct, className }: { pct?: number; className?: string }) {
  if (pct === undefined) return <span className={className}>Battery unknown</span>;
  const [Icon, tone, word] = pct < 20 ? [BatteryWarning, "text-recall", "critical"] : pct < 40 ? [BatteryLow, "text-hold", "low"] : [BatteryMedium, "text-muted-foreground", ""];
  return (
    <span className={cn("inline-flex items-center gap-1.5 tabular-nums", className)}>
      <Icon aria-hidden className={cn("size-4", tone)} />
      <span className="sr-only">Battery</span>
      {pct}%{word && <span className={tone}>{word}</span>}
    </span>
  );
}
