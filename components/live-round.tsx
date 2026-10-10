"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
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
import { checkFloor, FLOOR_MODEL, floorModel, type FloorResult } from "@/lib/floor-model";
import { ORBIT_CALL, PATH, inPath, visionReason, type Vision } from "@/lib/verdict";
import { labelDetection, recordDetection } from "@/lib/evidence";
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
  watch?: ReactNode; // server-rendered live weather watch
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
// note: per-file source was not recorded when v1's test images were copied; both v1 sources are open licenses.
const FRAME_LICENSE = "v1 held-out test image (Kaggle CC0 or Mendeley CC BY 4.0; per-file source not recorded)";
// note: v1 model revision on the Hub; the v2 detector brings its own.
const FLOOR_REVISION = "942bd9c786bcb4b0e3b1521c6763a88a66134e6e";

/** Saves the detection and the operator's label to Neon. Returns the evidence row id. */
async function saveEvidence(frame: string, v: Vision, label: "confirm" | "reject") {
  const bytes = await (await fetch(frame)).arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const { score, ...box } = v.boxes[0];
  const { id } = await recordDetection({
    box,
    score,
    areaFrac: box.w * box.h,
    frameUri: frame,
    frameSha256: hash,
    source: "live",
    license: FRAME_LICENSE,
    waypoint: v.waypoint,
    modelId: v.model,
    modelRevision: FLOOR_REVISION,
    weather: null,
    rulesVersion: "verdict.ts vision v1",
    verdict: "HOLD",
  });
  const form = new FormData();
  form.set("detectionId", String(id));
  form.set("label", label);
  form.set("operator", "live round");
  await labelDetection(form);
  return id;
}
const SEGMENT = { pending: "bg-secondary", ok: "bg-go", failed: "bg-recall" };

export function LiveRound({ missions, defaultId, events: stream, anomalies, readings, names, sites, dock, outdoor, watch }: Props) {
  const startOf = (id: string) => stream.find((e) => e.missionId === id)!.at;
  // First paint opens three actions in, so the page shows a round in progress instead of "none yet". Restart still goes to the start.
  // note: capped just before the outdoor leg, so the floor model never downloads on first paint.
  const openingOf = (id: string) => {
    const evs = stream.filter((e) => e.missionId === id);
    const third = evs.filter((e) => e.type === "ACTION_COMPLETED" || e.type === "ACTION_FAILED")[2]?.at ?? evs[0].at;
    return Math.min(third, (outdoorArrival(evs, outdoor)?.at ?? Infinity) - 1);
  };
  const [missionId, setMissionId] = useState(defaultId);
  const [t, setT] = useState(() => openingOf(defaultId));
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(30);
  const [wetFrame, setWetFrame] = useState(false);
  const [progress, setProgress] = useState(0);
  const [floor, setFloor] = useState<{ key: string; result?: FloorResult; failed?: boolean } | null>(null);
  // Operator's answer to a floor HOLD, keyed to the waypoint + frame it answers.
  const [answer, setAnswer] = useState<{ key: string; label: "confirm" | "reject" | "override"; saved?: number | "failed" } | null>(null);

  const mission = missions.find((m) => m.id === missionId)!;
  const events = useMemo(() => stream.filter((e) => e.missionId === missionId), [stream, missionId]);
  const start = events[0].at;
  const end = endOf(events);

  const s = liveState(events, t, anomalies, readings);
  const startedBy = new Map(events.filter((e) => e.type === "ACTION_STARTED").map((e) => [e.actionId, e]));
  const anomaliesBy = Map.groupBy(s.anomalies, (a) => a.actionId);
  const where = (e?: LiveEvent) => (e ? `${e.locationId} ${names[e.locationId!] ?? ""} · ${e.assetId} ${names[e.assetId!] ?? ""}` : "");
  const truth = TRUTH_UI[s.truth];
  const TruthIcon = TRUTH_ICON[s.truth];

  // Floor check: runs once Spot reaches the outdoor leg, again if the frame toggles. While it runs, Spot waits at the waypoint (unknown floor is never GO).
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
  // note: v1 is an image classifier, so a wet frame becomes one full-frame box. The v2 detector returns real boxes.
  const vision: Vision | null = arrival
    ? {
        status: check?.failed ? "error" : check?.result ? "ok" : "pending",
        waypoint: arrival.locationId!,
        model: FLOOR_MODEL,
        boxes: check?.result && check.result.pWet > 0.5 ? [{ x: 0, y: 0, w: 1, h: 1, score: check.result.pWet }] : [],
      }
    : null;
  const floorCall = vision ? visionReason(vision) : null;
  const wet = vision?.boxes.some(inPath) ?? false;
  const answered = answer?.key === floorKey ? answer : null;
  // Spot waits at the waypoint while the floor is wet or unknown, until the operator answers. Playback is the stand-in for Spot.
  const held = floorCall?.verdict === "HOLD" && !answered;
  const running = playing && t < end && !held;

  // Playback clock: the interval is the outside system. It stops itself at the mission's end or a floor hold.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setT((prev) => Math.min(end, prev + speed * TICK_MS)), TICK_MS);
    return () => clearInterval(id);
  }, [running, speed, end]);
  const answerFloor = (label: "confirm" | "reject" | "override") => {
    const key = floorKey!;
    setAnswer({ key, label });
    if (label === "override" || !vision?.boxes.length) return;
    saveEvidence(frame, vision, label).then(
      (saved) => setAnswer((a) => (a?.key === key ? { ...a, saved } : a)),
      () => setAnswer((a) => (a?.key === key ? { ...a, saved: "failed" } : a)),
    );
  };
  const hasOutdoorLeg = mission.plan.some((a) => outdoor.includes(a.locationId));
  // Pre-warm on the first playback control press, not on first paint, so the page stays fast.
  const warm = () => void floorModel(setProgress).catch(() => {});

  const pick = (id: string) => {
    warm();
    setMissionId(id);
    setT(startOf(id));
    setPlaying(true);
    setAnswer(null);
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
            <span aria-hidden className={cn("size-2 rounded-full bg-recall", running && "animate-pulse-soft")} />
            LIVE · simulated
          </span>
        }
      />
      <main className="mx-auto max-w-[1440px] space-y-5 px-8 py-6">
        {watch}
        <Card className="animate-rise">
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
                {running ? "Pause" : t >= end ? "Ended" : held ? "Held" : "Play"}
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
              <span className="ml-auto font-mono text-2xl font-medium tabular-nums">{kitClock(t)}</span>
              <span className="text-xs text-helper">kit time · Live (simulated from NextEra&apos;s replay stream)</span>
            </div>
            <div className="panel-inset p-3">
              <ol aria-label="Mission actions" className="flex gap-1">
                {mission.plan.map((a, i) => {
                  const r = s.results[a.id] ?? "pending";
                  const text = `Action ${i + 1}, ${words(a.type)} at ${a.locationId}: ${r === "ok" ? "OK" : r}`;
                  return (
                    <li key={a.id} title={text} className={cn("h-2.5 flex-1 rounded-[3px] transition-colors duration-300", SEGMENT[r], s.current?.actionId === a.id && "ring-2 ring-foreground/70")}>
                      <span className="sr-only">{text}</span>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-2 font-mono text-[11px] text-helper tabular-nums">
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
          <Card className="col-span-12 animate-rise [--rise-delay:80ms] lg:col-span-8">
            <CardHeader>
              <CardTitle>Where Spot is now</CardTitle>
              <CardDescription>Planned route for {mission.id}; white marker = current waypoint</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FacilityMap sites={sites} route={mission.plan.map((a) => a.locationId)} spot={s.current?.locationId} wet={wet && answered?.label !== "reject" ? vision?.waypoint : undefined} outdoor={outdoor} dock={dock} />
              <div className="panel-inset flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
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
            <Card className="animate-rise [--rise-delay:120ms]">
              <CardHeader>
                <CardTitle>Now</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="panel-inset grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-4 py-3 text-sm [&_dt]:font-mono [&_dt]:text-[11px] [&_dt]:tracking-wider [&_dt]:uppercase">
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

            <Card className="animate-rise [--rise-delay:160ms]">
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

            <Card className="animate-rise [--rise-delay:200ms]">
              <CardHeader>
                <CardTitle>Floor check</CardTitle>
                <CardDescription>Wet-floor model on the outdoor leg ({outdoor.join(", ")}, assumed outdoors)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="label-caps text-helper">Frame: public sample image, not NextEra (the kit has no camera frames)</p>
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local sample frame, no optimization needed */}
                  <img src={frame} alt={wetFrame ? "Sample frame: wet entrance" : "Sample frame: dry entrance"} className="max-h-36 w-full rounded object-cover ring-1 ring-border" />
                  <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden className="pointer-events-none absolute inset-0 size-full">
                    <rect x={PATH.xMin} y={PATH.yMin} width={PATH.xMax - PATH.xMin} height={1 - PATH.yMin} fill="none" stroke="#f4f4f4" strokeOpacity="0.6" strokeWidth="1.5" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
                    {vision?.boxes.map((b, i) => (
                      <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill="var(--hold)" fillOpacity="0.15" stroke="var(--hold)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                    ))}
                  </svg>
                </div>
                <p className="text-xs text-helper">Dashed box: Spot&apos;s assumed walking path (our assumption, no camera calibration in the kit).</p>
                <div aria-live="polite" className="space-y-2">
                  {!hasOutdoorLeg ? (
                    <p className="text-muted-foreground">This route has no outdoor leg. No floor check runs.</p>
                  ) : !arrival ? (
                    <p className="text-muted-foreground">Runs when Spot reaches {outdoor.join(", ")}.</p>
                  ) : !check ? (
                    <label className="block space-y-1 text-muted-foreground">
                      Spot waits at {arrival.locationId}: {progress < 100 ? `downloading water model ${progress}%` : "checking frame"}
                      <progress value={progress} max={100} className="block h-1.5 w-full accent-primary" />
                    </label>
                  ) : (
                    <>
                      {check.result && (
                        <p className="font-mono tabular-nums">
                          p(wet) = {check.result.pWet.toFixed(2)} · {check.result.ms} ms in browser
                        </p>
                      )}
                      <p className="flex items-start gap-2">
                        <VerdictChip verdict={floorCall!.verdict} /> {floorCall!.text}
                      </p>
                      {held && (
                        <div className="panel-inset space-y-2 p-3">
                          <p className="font-medium">Operator: is there water in Spot&apos;s path?</p>
                          <div className="flex flex-wrap gap-2">
                            {check.failed ? (
                              <Button size="sm" variant="outline" onClick={() => answerFloor("override")}>
                                Continue without floor check
                              </Button>
                            ) : (
                              <>
                                <Button size="sm" onClick={() => answerFloor("confirm")}>
                                  Confirm water: mark hazard, continue
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => answerFloor("reject")}>
                                  Reject: floor is dry
                                </Button>
                              </>
                            )}
                          </div>
                          <p className="label-caps text-helper">Calls Kairos would make · SIMULATED, not sent</p>
                          <ul className="space-y-1 font-mono text-[11px] text-muted-foreground">
                            <li>Spot: CORE I/O Network Compute Bridge worker returns the water detection</li>
                            <li>Spot: Autowalk Area Callback at {arrival.locationId} holds the walk until the operator answers</li>
                            <li>Spot: Hazard Avoidance AddHazards (prefer avoid) at {arrival.locationId}</li>
                            <li>Orbit: {ORBIT_CALL.HOLD}, so the next round does not launch</li>
                          </ul>
                        </div>
                      )}
                      {answered && (
                        <p className="text-muted-foreground">
                          {answered.saved === "failed" ? (
                            <span className="text-hold">Could not save to the evidence log. </span>
                          ) : answered.saved ? (
                            <Link href="/evidence" className="text-link hover:underline">
                              Saved to Neon as evidence #{answered.saved}.{" "}
                            </Link>
                          ) : null}
                          Operator {answered.label === "confirm" ? "confirmed water; Kairos marks it as a hazard for Spot to avoid (simulated) and the round continues" : answered.label === "reject" ? "rejected the detection; Spot continues" : "overrode the missing floor check"}.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="animate-rise [--rise-delay:240ms]">
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
