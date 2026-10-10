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
import { waterModel, WATER_REVISION } from "@/lib/water-model";
import { SpotCam, useSpotCam, type CamFrame } from "@/components/spot-cam";
import demoWet from "@/public/captures/demo-wet.json";
import demoDry from "@/public/captures/demo-dry.json";
import { ORBIT_CALL, inPath, visionReason, type Vision } from "@/lib/verdict";
import { labelDetection, recordDetection } from "@/lib/evidence";
import { endOf, kitClock, liveState, outdoorArrival, type EventType, type LiveAnomaly, type LiveEvent, type LiveReading, type Truth } from "@/lib/live";
import { FacilityMap, type MapSite } from "@/components/facility-map";
import { PageHeader } from "@/components/page-header";
import { SEVERITY_UI, TRUTH_UI, VerdictChip } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Why } from "@/components/why";

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
  watch?: ReactNode; // server-rendered live weather banner
  radar?: ReactNode; // server-rendered radar card
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
// note: the kit has no camera frames. Both walks are held-out test photos the model never trained on, checked by eye:
// wet = unmistakable puddles, smallest first; dry = clearly dry floors (two from a camera on a Spot robot, UT Austin SCAND).
const WALKS: Record<"wet" | "dry", CamFrame[]> = { wet: demoWet.frames, dry: demoDry.frames };

/** Saves the detection and the operator's label to Neon. Returns the evidence row id. */
async function saveEvidence(frame: CamFrame, v: Vision, label: "confirm" | "reject") {
  const bytes = await (await fetch(frame.src)).arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const { score, ...box } = v.boxes.filter(inPath).sort((a, b) => b.score - a.score)[0] ?? v.boxes[0];
  const { id } = await recordDetection({
    box,
    score,
    areaFrac: box.w * box.h,
    frameUri: frame.src,
    frameSha256: hash,
    source: "live",
    license: `${frame.license} (${frame.source})`,
    waypoint: v.waypoint,
    modelId: v.model,
    modelRevision: WATER_REVISION,
    weather: null,
    rulesVersion: "verdict.ts vision v2 lane",
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

export function LiveRound({ missions, defaultId, events: stream, anomalies, readings, names, sites, dock, outdoor, watch, radar }: Props) {
  // First paint opens three actions in, so the page shows a round in progress instead of "none yet". Restart still goes to the start.
  // note: capped just before the outdoor leg, so the floor model never downloads on first paint.
  const openingOf = (id: string) => {
    const evs = stream.filter((e) => e.missionId === id);
    // The camera stop is the story: open 20 s (kit time) before Spot reaches it, so the camera starts within a second.
    const arrive = outdoorArrival(evs, outdoor)?.at;
    if (arrive !== undefined) return Math.max(evs[0].at, arrive - 20000);
    return evs.filter((e) => e.type === "ACTION_COMPLETED" || e.type === "ACTION_FAILED")[2]?.at ?? evs[0].at;
  };
  const [missionId, setMissionId] = useState(defaultId);
  const [t, setT] = useState(() => openingOf(defaultId));
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(30);
  const [wetFrame, setWetFrame] = useState(true);
  // Operator's answer to a floor HOLD, keyed to the waypoint visit it answers (one answer covers the rest of that walk).
  const [answer, setAnswer] = useState<{ key: string; label: "confirm" | "reject" | "override"; frame: string; saved?: number | "failed" } | null>(null);

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

  // Floor check: once Spot reaches the outdoor leg, its camera captures the walk and the water model checks every capture.
  // While a capture is being checked, Spot waits (unknown floor is never GO).
  const arrival = outdoorArrival(s.events, outdoor);
  const floorKey = arrival ? `${arrival.id}|${wetFrame ? "wet" : "dry"}` : null;
  const walk = WALKS[wetFrame ? "wet" : "dry"];
  // Held is derived below from the camera's own verdict; the camera stops capturing while Spot is held.
  const [camHeld, setCamHeld] = useState(false);
  const cam = useSpotCam(walk, { active: !!arrival, paused: camHeld, waypoint: arrival?.locationId ?? "" });
  // Confirm or override covers the whole stop (the hazard is marked); a reject covers only the capture it answered,
  // so new water on a later capture asks again.
  const answered = answer?.key === floorKey && (answer.label !== "reject" || answer.frame === cam.frame.src) ? answer : null;
  const vision = cam.vision;
  const floorCall = vision ? visionReason(vision) : null;
  const wet = vision?.boxes.some(inPath) ?? false;
  // Spot waits at the waypoint while the floor is wet or unknown, until the operator answers. Playback is the stand-in for Spot.
  const held = floorCall?.verdict === "HOLD" && !answered;
  if (held !== camHeld) setCamHeld(held); // render-time sync: the camera reads last render's hold
  const running = playing && t < end && !held;

  // Playback clock: the interval is the outside system. It stops itself at the mission's end or a floor hold.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setT((prev) => Math.min(end, prev + speed * TICK_MS)), TICK_MS);
    return () => clearInterval(id);
  }, [running, speed, end]);
  const answerFloor = (label: "confirm" | "reject" | "override") => {
    const key = floorKey!;
    setAnswer({ key, label, frame: cam.frame.src });
    if (label === "override" || !vision?.boxes.length) return;
    saveEvidence(cam.frame, vision, label).then(
      (saved) => setAnswer((a) => (a?.key === key ? { ...a, saved } : a)),
      () => setAnswer((a) => (a?.key === key ? { ...a, saved: "failed" } : a)),
    );
  };
  const hasOutdoorLeg = mission.plan.some((a) => outdoor.includes(a.locationId));
  // Pre-warm on the first playback control press, not on first paint, so the page stays fast.
  const warm = () => void waterModel().catch(() => {});
  // Start the model download as soon as the page opens, so the camera stop never waits on venue wifi.
  useEffect(() => {
    void waterModel().catch(() => {});
  }, []);

  const pick = (id: string) => {
    warm();
    setMissionId(id);
    setT(openingOf(id));
    setPlaying(true);
    setAnswer(null);
    cam.restart();
  };

  return (
    <>
      <PageHeader
        title="Live round"
        subtitle={`${mission.name} · route ${mission.id}`}
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
                Puddle on route
              </label>
              <span className="ml-auto font-mono text-2xl font-medium tabular-nums">
                {String(Math.floor((t - start) / 60000)).padStart(2, "0")}:{String(Math.floor(((t - start) % 60000) / 1000)).padStart(2, "0")}
              </span>
              <span className="text-xs text-helper">into the round</span>
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
                {s.done} of {mission.plan.length} actions done
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

        <div className="grid grid-cols-12 items-start gap-5">
          <div className="col-span-12 space-y-5 lg:col-span-8">
        {hasOutdoorLeg && (
          <Card className="animate-rise [--rise-delay:60ms]">
            <CardHeader>
              <CardTitle>Spot camera · {outdoor.join(", ")}</CardTitle>
              <CardDescription>{arrival ? "Water in the lane holds Spot" : `Starts at ${outdoor.join(", ")}`}</CardDescription>
            </CardHeader>
            <CardContent>
              <SpotCam cam={cam} frames={walk} waypoint={arrival?.locationId ?? outdoor[0]} total={walk.length} />
            </CardContent>
          </Card>
        )}

          <Card className="animate-rise [--rise-delay:80ms]">
            <CardHeader>
              <CardTitle>Where Spot is now</CardTitle>
              <CardDescription>Route {mission.id}</CardDescription>
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
          </div>

          <div className="col-span-12 space-y-5 lg:col-span-4">
            <Card className="animate-rise [--rise-delay:200ms]">
              <CardHeader>
                <CardTitle>Floor check</CardTitle>
                <CardDescription>Operator decision at {outdoor.join(", ")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div aria-live="polite" className="space-y-2">
                  {!hasOutdoorLeg ? (
                    <p className="text-muted-foreground">This route has no outdoor leg. No floor check runs.</p>
                  ) : !arrival ? (
                    <p className="text-muted-foreground">Runs when Spot reaches {outdoor.join(", ")}.</p>
                  ) : !cam.result ? (
                    <label className="block space-y-1 text-muted-foreground">
                      Spot waits at {arrival.locationId}: {cam.progress > 0 && cam.progress < 100 ? `downloading water model ${cam.progress}%` : "checking capture"}
                      <progress value={cam.progress} max={100} className="block h-1.5 w-full accent-primary" />
                    </label>
                  ) : (
                    <>
                      <p className="flex items-start gap-2">
                        <VerdictChip verdict={floorCall!.verdict} /> {floorCall!.text}
                      </p>
                      {held && (
                        <div className="panel-inset space-y-2 p-3">
                          <p className="font-medium">Operator: is there water in Spot&apos;s path?</p>
                          <div className="flex flex-wrap gap-2">
                            {cam.result === "error" ? (
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
                          <Why label="What Kairos sends">
                            <ul className="space-y-1 font-mono">
                              <li>Spot: CORE I/O Network Compute Bridge worker returns the water detection</li>
                              <li>Spot: Autowalk Area Callback at {arrival.locationId} holds the walk until the operator answers</li>
                              <li>Spot: Hazard Avoidance AddHazards (prefer avoid) at {arrival.locationId}</li>
                              <li>Orbit: {ORBIT_CALL.HOLD}, so the next round does not launch</li>
                            </ul>
                          </Why>
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

            {radar}
            <details className="group rounded-2xl bg-card ring-1 ring-white/[0.06]">
              <summary className="cursor-pointer list-none px-4 py-3 font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase hover:text-foreground">
                Round details: status and event feed
              </summary>
              <div className="space-y-5 p-1">
            <Card className="animate-rise [--rise-delay:160ms]">
              <CardHeader>
                <CardTitle>True status so far</CardTitle>
                <CardDescription>Reported vs actual</CardDescription>
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

            <Card className="animate-rise [--rise-delay:240ms]">
              <CardHeader>
                <CardTitle>Event feed</CardTitle>
                <CardDescription>Newest first</CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="max-h-72 space-y-1 overflow-y-auto pr-1">
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
                              Floor check: water in Spot&apos;s path at {e.locationId}, score {Math.max(...vision!.boxes.filter(inPath).map((b) => b.score)).toFixed(2)}
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
            </details>
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
