"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, CloudRain, House, Pause, Play, RotateCcw, TriangleAlert } from "lucide-react";
import { waterModel, WATER_REVISION } from "@/lib/water-model";
import { SpotCam, useSpotCam, type CamFrame } from "@/components/spot-cam";
import approach from "@/public/captures/approach.json";
import { decide, inPath, LIMITS, ORBIT_CALL, visionReason, type Health, type Vision, type Weather, type WeatherStep } from "@/lib/verdict";
import { labelDetection, recordDetection } from "@/lib/evidence";
import { legTime, walk, walkAt, type Pt } from "@/lib/live";
import { FacilityMap, pos, type MapPath, type MapSite } from "@/components/facility-map";
import { RADAR_FRAMES, StormRadar } from "@/components/storm-radar";
import { PageHeader } from "@/components/page-header";
import { VerdictChip } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Why } from "@/components/why";
import { cn } from "@/lib/utils";

type Props = {
  mission: string;
  stops: string[]; // planned waypoints after the dock, ending at the first outdoor stop
  sites: MapSite[];
  dock: string;
  outdoor: string[];
  steps: WeatherStep[]; // recorded 15-minute rain steps, oldest first
  alerts: string[];
  recordedAt: string;
};
type Answer = { run: number; stop: number; label: "confirm" | "reject" | "override"; saved?: number | "failed" };

const SPEEDS = [1, 2, 4];
// One continuous walk toward a puddle: 9 consecutive held-out photos of one path (Kaggle scene k:13, CC0), never trained on.
const FRAMES: CamFrame[] = approach.frames;
// note: first frame whose model box overlaps Spot's lane (checked in the browser); earlier frames show the puddle ahead, outside the lane.
const HOLD_FRAME = 6;
// Weather only, like the weather watch: full battery, no route risk, so the verdict is the weather's alone.
const HEALTH: Health = { outdoor: true, batteryPct: 100, projectedEndPct: 100, routeRisk: [] };
const WATCH_MIN = 15; // ASSUMPTION: Spot is at most 15 min from the dock on this route
// note: the replay clock is scaled so the recorded storm reaches the plant while Spot walks the leg to the outdoor stop.
const RECALL_AT = 0.45;
const TURN_S = 1; // Spot stops and turns around before walking home
const clock = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

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

/** The simulated round: Spot walks the route, the camera checks the floor at each stop, and the recorded storm plays on the same clock. */
export function LiveRound({ mission, stops, sites, dock, outdoor, steps, alerts, recordedAt }: Props) {
  const [s, setS] = useState(0); // round seconds; stops while Spot waits on the floor check or the operator
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [run, setRun] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);

  const plan = useMemo(() => {
    const byId = new Map(sites.map((x) => [x.id, x]));
    const pt = (id: string): Pt => ({ ...pos(byId.get(id)!), floor: byId.get(id)!.floor });
    const ids = [dock, ...stops, dock];
    const out = walk(ids.map(pt));
    const node = (stop: number) => out.nodes.findIndex((n) => n.stop === stop);
    const outdoorStop = ids.findIndex((id) => outdoor.includes(id));
    const hold = outdoorStop - 1; // last indoor stop: the puddle reaches Spot's lane here
    const holdAt = out.arrive[node(hold)];
    // No hindsight: at replay time ms the dispatcher sees only the recorded steps up to ms.
    const t0 = Date.parse(steps[0].time);
    const weatherAt = (ms: number): Weather => ({
      fetchedAt: new Date(ms).toISOString(),
      source: "Open-Meteo 15-min rain, recorded Sat 5:56 PM",
      alerts,
      steps: steps.filter((x) => Date.parse(x.time) <= ms),
    });
    const verdictAt = (ms: number) => decide(weatherAt(ms), HEALTH, { now: new Date(ms), start: new Date(ms), end: new Date(ms + WATCH_MIN * 60000) }, true);
    const recallStep = steps.find((x) => verdictAt(Date.parse(x.time)).verdict === "RECALL");
    const sRecall = recallStep && outdoorStop > 0 ? legTime(out, outdoorStop, RECALL_AT) : null;
    const rate = recallStep && sRecall ? (Date.parse(recallStep.time) - t0) / sRecall : 60000; // replay ms per round second
    const home = sRecall === null ? null : walk([walkAt(out, sRecall).pt, pt(dock)], sRecall + TURN_S, 0);
    const end = (home ?? out).arrive.at(-1)!;
    // Camera: frames advance as Spot walks toward the hold stop, frozen while Spot stands at a stop.
    const frameAt = (t: number) => (t >= holdAt ? HOLD_FRAME : Math.min(HOLD_FRAME - 1, Math.floor((HOLD_FRAME * t) / holdAt)));
    return { ids, out, node, hold, holdAt, t0, rate, verdictAt, sRecall, home, end, frameAt };
  }, [sites, stops, dock, outdoor, steps, alerts]);
  const { ids, out, node, hold, sRecall, home, end } = plan;

  const recalled = sRecall !== null && s >= sRecall;
  const docked = recalled && s >= end;
  const w = recalled && home ? walkAt(home, s) : walkAt(out, s);
  const dwelling = recalled ? undefined : w.dwelling;
  const checking = dwelling !== undefined && dwelling > 0 && dwelling < ids.length - 1;
  const frame = plan.frameAt(dwelling !== undefined ? out.arrive[w.k] : recalled ? end : s);
  const waypoint = ids[recalled ? plan.hold : (dwelling ?? w.reached)];
  const cam = useSpotCam(FRAMES, frame, waypoint);
  const vision = checking ? cam.vision : null;
  const floorCall = vision ? visionReason(vision) : null;
  const answered = answer?.run === run && answer.stop === dwelling ? answer : null;
  const cleared = !checking || floorCall?.verdict === "GO" || !!answered;
  const held = checking && vision?.status !== "pending" && floorCall?.verdict === "HOLD" && !answered;
  // Spot cannot leave a stop until its floor is known and clear, or the operator answered.
  const gate = cleared ? end : out.depart[w.k];

  const ms = Math.round(plan.t0 + s * plan.rate);
  const weather = plan.verdictAt(ms);
  const rainNow = steps.findLast((x) => Date.parse(x.time) <= ms)?.precipMmPerHour ?? null;
  const radar = sRecall ? Math.min(RADAR_FRAMES.length - 1, Math.floor(((RADAR_FRAMES.length - 1) * s) / sRecall)) : RADAR_FRAMES.length - 1;

  // Playback clock: the animation frame loop is the outside system. It stops at the gate and at the dock.
  const done = s >= end;
  useEffect(() => {
    if (!playing || done) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      setS((v) => Math.min(gate, v + dt * speed));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, done, speed, gate]);
  // Start the model download as soon as the page opens, so the first stop never waits on venue wifi.
  useEffect(() => {
    void waterModel().catch(() => {});
  }, []);

  const answerFloor = (label: Answer["label"]) => {
    if (dwelling === undefined || !vision) return;
    const key = { run, stop: dwelling };
    setAnswer({ ...key, label });
    if (label === "override" || !vision.boxes.length) return;
    const same = (a: Answer | null) => a?.run === key.run && a.stop === key.stop;
    saveEvidence(cam.frame, vision, label).then(
      (saved) => setAnswer((a) => (same(a) ? { ...a!, saved } : a)),
      () => setAnswer((a) => (same(a) ? { ...a!, saved: "failed" } : a)),
    );
  };
  const restart = () => {
    setS(0);
    setRun((r) => r + 1);
    setAnswer(null);
    setPlaying(true);
  };

  // What each indoor stop's floor check found, from the cached model results.
  const stopResult = (i: number) => {
    const r = cam.results[FRAMES[plan.frameAt(out.arrive[node(i)])].src];
    return r === undefined ? null : r === "error" ? "error" : r.boxes.some((d) => inPath(d.box)) ? "water" : "dry";
  };
  const holdAnswer = answer?.run === run && answer.stop === hold ? answer : null;
  const holdSeen = !!holdAnswer || (dwelling === hold && held);
  const story: { label: string; done: boolean; tone: "go" | "hold" | "recall" }[] = [
    { label: "Round started", done: s > 0, tone: "go" },
    ...ids.slice(1, hold).map((id, j) => {
      const r = stopResult(j + 1);
      return { label: r === "water" ? `${id} water` : r === "error" ? `${id} unchecked` : `${id} floor dry`, done: s > out.depart[node(j + 1)], tone: r === "dry" ? ("go" as const) : ("hold" as const) };
    }),
    { label: `Water in path at ${ids[hold]}: HOLD`, done: holdSeen, tone: "hold" },
    {
      label: holdAnswer?.label === "reject" ? "Operator: floor is dry" : holdAnswer?.label === "override" ? "Operator overrode" : "Operator confirmed",
      done: !!holdAnswer,
      tone: "go",
    },
    { label: "Storm reached the plant", done: recalled, tone: "recall" },
    { label: "RECALL sent", done: recalled && weather.verdict === "RECALL", tone: "recall" },
    { label: "Docked", done: docked, tone: "go" },
  ];

  // Map paths: walked in blue, planned dashed; after a recall the rest of the route is cancelled and the way home is red.
  const atRecall = sRecall !== null ? walkAt(out, recalled ? sRecall : s) : w;
  const paths: MapPath[] = recalled
    ? [
        { pts: atRecall.ahead, tone: "cancelled" },
        { pts: w.ahead, tone: "home" },
        { pts: atRecall.trail, tone: "walked" },
        { pts: w.trail, tone: "homeWalked" },
      ]
    : [
        { pts: w.ahead, tone: "planned" },
        { pts: w.trail, tone: "walked" },
      ];
  const next = w.next !== undefined ? ids[w.next] : dock;
  const status = docked
    ? `Docked at ${dock}`
    : recalled
      ? `Recalled: walking the shortest way back to ${dock}`
      : held
        ? `Holding at ${ids[dwelling!]}: waiting for the operator`
        : checking && !cleared
          ? `Checking the floor at ${ids[dwelling!]}`
          : checking
            ? `Floor clear at ${ids[dwelling!]}`
            : s === 0
              ? `On the dock at ${dock}`
              : `Walking to ${next}${outdoor.includes(next) ? " (outdoor)" : ""}`;
  const running = playing && !docked && s < gate;

  return (
    <>
      <PageHeader
        title="Live round"
        subtitle={`Route ${mission} · St. Lucie · weather watch and floor check in one round`}
        actions={<span className="rounded-full bg-secondary px-2.5 py-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase ring-1 ring-border">Simulation</span>}
      />
      <main className="mx-auto max-w-[1440px] space-y-4 px-4 py-5 sm:px-8">
        <div className="grid gap-4 lg:grid-cols-12">
          <Card className="animate-rise lg:col-span-5">
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => setPlaying((p) => !p)} disabled={docked} aria-label={running ? "Pause" : "Play"}>
                  {running ? <Pause aria-hidden /> : <Play aria-hidden />}
                  {docked ? "Ended" : playing ? (running ? "Pause" : "Waiting") : "Play"}
                </Button>
                <Button variant="outline" onClick={restart}>
                  <RotateCcw aria-hidden /> Restart
                </Button>
                <div role="group" aria-label="Playback speed" className="flex gap-1 rounded-lg bg-panel p-0.5">
                  {SPEEDS.map((v) => (
                    <Button key={v} size="sm" variant={speed === v ? "secondary" : "ghost"} aria-pressed={speed === v} onClick={() => setSpeed(v)}>
                      {v}x
                    </Button>
                  ))}
                </div>
                <span className="ml-auto text-right font-mono text-sm tabular-nums">
                  <span className="text-2xl font-medium">{mmss(s)}</span>
                  <span className="block text-[11px] text-helper">{clock(ms)} at the plant (replayed)</span>
                </span>
              </div>
              <ol aria-label="What Kairos did this round" className="flex flex-wrap gap-1.5">
                {story.map((m) => (
                  <li
                    key={m.label}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ring-1 transition-colors duration-300",
                      !m.done && "text-helper ring-border",
                      m.done && m.tone === "go" && "bg-go/10 text-go ring-go/40",
                      m.done && m.tone === "hold" && "bg-hold/10 text-hold ring-hold/40",
                      m.done && m.tone === "recall" && "bg-recall/10 text-recall ring-recall/50",
                    )}
                  >
                    {m.done ? <Check aria-hidden className="size-3.5" /> : <span aria-hidden className="size-1.5 rounded-full bg-current" />}
                    {m.label}
                    <span className="sr-only">{m.done ? ", done" : ", not yet"}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card className={cn("animate-rise [--rise-delay:60ms] lg:col-span-7", recalled && !docked && "ring-recall/60", docked && "ring-go/40")}>
            <CardContent className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
              <StormRadar frame={radar} stamp={`${radar + 1}/${RADAR_FRAMES.length}`} className="mx-auto w-32 sm:w-full" />
              <div aria-live="polite" className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="label-caps">Weather watch</span>
                  <VerdictChip verdict={weather.verdict} />
                  <span className="ml-auto text-[11px] text-helper">Recorded Sat 5:56 PM storm, replayed</span>
                </div>
                <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                  <p className="flex items-baseline gap-2">
                    <CloudRain aria-hidden className={cn("size-5 self-center", recalled ? "text-recall" : "text-muted-foreground")} />
                    <span className="font-mono text-3xl font-medium tabular-nums">{rainNow === null ? "--" : rainNow.toFixed(1)}</span>
                    <span className="text-sm text-muted-foreground">mm/h rain now</span>
                  </p>
                  <RainMeter mm={rainNow} />
                </div>
                {docked ? (
                  <p className="flex items-start gap-2 rounded-lg bg-go/10 px-3 py-2 text-sm ring-1 ring-go/40">
                    <House aria-hidden className="mt-0.5 size-4 shrink-0 text-go" />
                    <span>
                      <span className="font-semibold text-go">Spot is docked at {dock}.</span> The storm cut the round short; the outdoor leg did not run.
                    </span>
                  </p>
                ) : recalled ? (
                  <div role="alert" className="space-y-1 rounded-lg bg-recall/10 px-3 py-2 text-sm ring-1 ring-recall/50">
                    <p className="flex items-start gap-2">
                      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 animate-pulse-soft text-recall" />
                      <span>
                        <span className="font-semibold text-recall">RECALL:</span> {(weather.reasons.find((r) => r.verdict === "RECALL")?.text ?? "storm at the plant").split(";")[0]}. Spot walks the shortest way back to the dock.
                      </span>
                    </p>
                    <p className="font-mono text-[11px] break-all text-muted-foreground">Orbit (simulated): {ORBIT_CALL.RECALL}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {weather.verdict === "GO"
                      ? `Dry or light rain: Spot is IP54, so it keeps walking. Kairos recalls it above ${LIMITS.moderateRainMmPerHour} mm/h or ${LIMITS.thunderPct}% thunder.`
                      : (weather.reasons[0]?.text.split(";")[0] ?? "Weather unknown: hold")}
                  </p>
                )}
                <Why>
                  <p>Rain: Open-Meteo 15-minute steps for the plant from the Sat 5:56 PM snapshot, played in order. The dispatcher sees only steps up to the replay time. Thunder is not in the 15-minute feed.</p>
                  <p>Radar: NEXRAD via IEM, the six frames recorded {clock(Date.parse(recordedAt) - 50 * 60000)} to {clock(Date.parse(recordedAt))}, played oldest to newest. Map © OpenStreetMap.</p>
                  <p>Rules: lib/verdict.ts decide(), the same rules as the dashboard. Replay clock is sped up to fit the round.</p>
                </Why>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-12">
          <Card className="animate-rise [--rise-delay:120ms] lg:col-span-7">
            <CardContent className="space-y-3">
              <p aria-live="polite" className="flex items-center gap-2 text-sm">
                <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-[#ffd60a]" />
                <span className="font-medium">{status}</span>
              </p>
              <FacilityMap
                sites={sites}
                paths={paths}
                spotAt={w.pt}
                wet={holdSeen && holdAnswer?.label !== "reject" ? ids[hold] : undefined}
                outdoor={outdoor}
                dock={dock}
                neutral={ids}
              />
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-helper">
                <span>
                  <span className="text-[#4f9fe8]">━</span> walked
                </span>
                <span>┄ planned</span>
                <span>
                  <span className="text-recall">━</span> back to dock
                </span>
                <span>dashed ring = outdoor leg</span>
              </p>
            </CardContent>
          </Card>

          <Card className="animate-rise [--rise-delay:180ms] lg:col-span-5">
            <CardContent className="space-y-3">
              <SpotCam cam={cam} frames={FRAMES} waypoint={waypoint} total={FRAMES.length} around={false} credit="Example walk, public photos" />
              <div aria-live="polite" className="min-h-24 text-sm">
                {held ? (
                  <div className="space-y-2 rounded-lg bg-hold/10 p-3 ring-1 ring-hold/50">
                    <p className="flex items-start gap-2">
                      <VerdictChip verdict="HOLD" />
                      <span>{floorCall!.text}</span>
                    </p>
                    <p className="font-medium">Operator: is there water in Spot&apos;s path?</p>
                    <div className="flex flex-wrap gap-2">
                      {vision?.status === "error" ? (
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
                        <li>Spot: Autowalk Area Callback at {ids[dwelling!]} holds the walk until the operator answers</li>
                        <li>Spot: Hazard Avoidance AddHazards (prefer avoid) at {ids[dwelling!]}</li>
                        <li>Orbit: {ORBIT_CALL.HOLD}</li>
                      </ul>
                    </Why>
                  </div>
                ) : checking && !cleared ? (
                  <label className="block space-y-1 text-muted-foreground">
                    Spot waits at {ids[dwelling!]}: {cam.progress > 0 && cam.progress < 100 ? `downloading the water model ${cam.progress}%` : "checking the floor"}
                    <progress value={cam.progress} max={100} className="block h-1.5 w-full accent-primary" />
                  </label>
                ) : holdAnswer ? (
                  <p className="text-muted-foreground">
                    At {ids[hold]} the operator {holdAnswer.label === "confirm" ? "confirmed water: Kairos marks a hazard so Spot walks around it" : holdAnswer.label === "reject" ? "rejected the detection" : "overrode the missing floor check"}.{" "}
                    {holdAnswer.saved === "failed" ? (
                      <span className="text-hold">Could not save to the evidence log.</span>
                    ) : holdAnswer.saved ? (
                      <Link href="/evidence" className="text-link hover:underline">
                        Saved to Neon as evidence #{holdAnswer.saved}.
                      </Link>
                    ) : holdAnswer.label !== "override" ? (
                      "Saving to Neon..."
                    ) : null}
                  </p>
                ) : (
                  <p className="text-muted-foreground">Kairos checks the floor ahead at every stop. Water in Spot&apos;s lane holds Spot there until an operator answers.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}

/** Rain rate against Spot's light-rain limit: 10 cells of 0.5 mm/h, the limit after cell 5. No inline styles. */
function RainMeter({ mm }: { mm: number | null }) {
  const cells = Array.from({ length: 10 }, (_, i) => (i + 1) * 0.5);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-0.5" role="img" aria-label={`Rain ${mm ?? "unknown"} mm/h; Spot's limit is ${LIMITS.moderateRainMmPerHour} mm/h`}>
        {cells.map((c, i) => (
          <span
            key={c}
            className={cn(
              "h-3 w-3 rounded-[2px] transition-colors duration-300",
              mm !== null && mm >= c - 0.25 && mm > 0 ? (c > LIMITS.moderateRainMmPerHour ? "bg-recall" : "bg-primary") : "bg-secondary",
              i === 5 && "ml-1.5",
            )}
          />
        ))}
      </div>
      <p className="font-mono text-[10px] text-helper">limit {LIMITS.moderateRainMmPerHour} mm/h (IP54, light rain)</p>
    </div>
  );
}
