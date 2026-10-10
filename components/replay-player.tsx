"use client";

import { useEffect, useMemo, useState } from "react";
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { bands, stateAt, type Round, type StormFixture } from "@/lib/replay";
import { logDecision, resetReplay } from "@/lib/decisions";
import { ORBIT_CALL, RECALL_ALERTS } from "@/lib/verdict";
import { FacilityMap, type MapSite } from "@/components/facility-map";
import { ReasonList, VerdictBlock } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const clock = (t: number) => new Date(t).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const MINUTE = 60000;
const SPEEDS = [1, 5, 15]; // replay minutes per real second

// Timeline colors always have a text legend next to them.
const BAND_FILL: Record<string, string> = { GO: "fill-go", HOLD: "fill-hold", RECALL: "fill-recall", DONE: "fill-secondary" };
const BAND_LABEL: Record<string, string> = { GO: "GO", HOLD: "HOLD", RECALL: "RECALL", DONE: "Round finished" };

type Props = { fixture: StormFixture; round: Round; sites: MapSite[]; dock: string; outdoor: string[] };

export function ReplayPlayer({ fixture, round, sites, dock, outdoor }: Props) {
  const start = Date.parse(fixture.window.start);
  const end = Date.parse(fixture.window.end);
  // Open 15 min before launch: real conditions and a GO on screen before Play. The slider still reaches the window start.
  const opening = Math.max(start, round.launch - 15 * MINUTE);
  const [t, setT] = useState(opening);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(5);

  const s = stateAt(fixture, round, t);
  const timeline = useMemo(() => bands(fixture, round), [fixture, round]);

  // Playback clock: an interval is the outside system here. Pauses itself when the verdict changes so the operator can confirm.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setT((prev) => {
        const next = Math.min(end, prev + speed * MINUTE * 0.25);
        const changed = stateAt(fixture, round, prev).verdict !== stateAt(fixture, round, next).verdict;
        if (changed || next >= end) setPlaying(false);
        return next;
      });
    }, 250);
    return () => clearInterval(id);
  }, [playing, speed, end, fixture, round]);

  // The conservative baseline: when would an NWS warning alone have recalled Spot?
  const firstWarning = fixture.alerts
    .filter((x) => x.coversSite !== false && RECALL_ALERTS.includes(x.event) && Date.parse(x.start) >= round.launch)
    .map((x) => Date.parse(x.start))
    .sort((x, y) => x - y)[0];
  const conditions = fixture.steps.filter((x) => Date.parse(x.time) <= t).at(-1);
  // Hindsight, shown only after Spot is back: when did the worst weather actually arrive?
  const worst = s.recallAt
    ? fixture.steps
        .filter((x) => Date.parse(x.time) > s.recallAt!)
        .reduce<StormFixture["steps"][number] | null>((w, x) => ((x.precipMmPerHour ?? 0) > (w?.precipMmPerHour ?? -1) ? x : w), null)
    : null;

  return (
    <div className="grid grid-cols-12 gap-5">
      <Card className="col-span-12 animate-rise">
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Button onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause replay" : "Play replay"}>
              {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
              {playing ? "Pause" : t >= end ? "Ended" : "Play"}
            </Button>
            <div role="group" aria-label="Replay speed" className="flex gap-1">
              {SPEEDS.map((v) => (
                <Button key={v} size="sm" variant={speed === v ? "secondary" : "ghost"} aria-pressed={speed === v} onClick={() => setSpeed(v)}>
                  {v * 60}x
                </Button>
              ))}
            </div>
            <span className="font-mono text-2xl font-medium tabular-nums">{clock(t)}</span>
            <span className="text-sm text-muted-foreground">EDT, {fixture.date}</span>
            <form action={resetReplay} className="ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPlaying(false);
                  setT(opening);
                }}
              >
                <RotateCcw aria-hidden /> Reset replay
              </Button>
            </form>
          </div>

          <Slider
            aria-label="Replay time"
            min={start}
            max={end}
            step={MINUTE}
            value={[t]}
            onValueChange={([v]) => {
              setPlaying(false);
              setT(v);
            }}
          />

          {/* Verdict bands: what the dispatcher said across the afternoon, sized by duration. */}
          <div className="panel-inset p-3">
            <div className="relative">
              <svg viewBox={`0 0 ${end - start} 24`} preserveAspectRatio="none" className="h-7 w-full overflow-hidden rounded-md" aria-hidden>
                {timeline.map((b) => (
                  <rect key={b.from} x={b.from - start} width={b.to - b.from} height="24" className={BAND_FILL[b.label]} />
                ))}
              </svg>
              {/* note: playhead position is live data, so it rides inline style; the left transition smooths the 250 ms ticks. */}
              <span
                aria-hidden
                className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-foreground shadow-[0_0_8px_rgb(255_255_255/0.6)] transition-[left] duration-250 ease-linear motion-reduce:transition-none"
                style={{ left: `${((t - start) / (end - start)) * 100}%` }}
              />
            </div>
            <p aria-hidden className="mt-2 flex justify-between border-t border-dotted border-border pt-1.5 font-mono text-[10px] text-helper">
              <span>{clock(start)}</span>
              <span>{clock(end)}</span>
            </p>
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
            {Object.entries(BAND_LABEL).map(([k, label]) => (
              <span key={k} className="inline-flex items-center gap-1">
                <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden>
                  <rect width="10" height="10" className={BAND_FILL[k]} />
                </svg>
                {label}
              </span>
            ))}
          </p>
          <ol className="flex flex-wrap gap-2" aria-label="Storm events">
            {fixture.events.map((e) => (
              <li key={e.time + e.label}>
                <button
                  onClick={() => {
                    setPlaying(false);
                    setT(Date.parse(e.time));
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.03] px-2 py-1 text-left text-xs ring-1 ring-white/[0.06] transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-link"
                >
                  <SkipForward aria-hidden className="size-3 text-link" />
                  <span className="font-mono text-link">{clock(Date.parse(e.time))}</span> {e.label}
                </button>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card className="col-span-7 animate-rise [--rise-delay:80ms]">
        <CardHeader>
          <CardTitle>Dispatcher at {clock(t)}</CardTitle>
          <CardDescription>
            Extra outdoor round launches {clock(round.launch)} (the first quarter hour the dispatcher said GO; kit rounds run at 02:00, 10:00, 18:00) ·{" "}
            {round.durationMin} min · {round.route.length} stops
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-[15rem_1fr] gap-6">
          <div className="space-y-3">
            <VerdictBlock
              verdict={s.verdict}
              caption={
                {
                  waiting: s.verdict === "GO" ? "Round can launch on schedule" : "Do not launch",
                  out: s.verdict === "GO" ? "Spot is on its round" : "Finish the round, then hold the next one",
                  returning: "Spot is heading to the dock",
                  docked: s.verdict === "GO" ? "Spot is docked · next round may launch" : "Spot is docked · hold the next round",
                  done: "Round finished",
                }[s.phase]
              }
            />
            {s.verdict !== "GO" && (
              <form action={logDecision}>
                <input type="hidden" name="verdict" value={s.verdict} />
                <input type="hidden" name="source" value="replay" />
                <input type="hidden" name="reasons" value={JSON.stringify(s.reasons)} />
                <Button name="action" value="confirmed">
                  Confirm {s.verdict}
                </Button>
                {ORBIT_CALL[s.verdict] && (
                  <details className="mt-2 text-xs text-helper">
                    <summary className="cursor-pointer">Orbit call (simulated)</summary>
                    <code className="mt-1 block font-mono break-all">{ORBIT_CALL[s.verdict]}</code>
                  </details>
                )}
              </form>
            )}
          </div>
          <div className="space-y-4">
            {s.recallAt && s.dockAt && t >= s.recallAt && (
              <div className="rounded bg-recall/10 p-3 ring-1 ring-recall/40">
                <p className="text-sm font-medium">
                  Recall at {clock(s.recallAt)} from {sites.find((x) => x.id === s.recallFrom)?.name} · Spot needs about{" "}
                  {Math.max(1, Math.round((s.dockAt - s.recallAt) / MINUTE))} min to reach the dock · docked by {clock(s.dockAt + MINUTE - 1)}
                </p>
                {firstWarning && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Earlier signal: thunder reported at the Fort Pierce station (our assumed rule). Using the NWS warning alone, the recall would have come at{" "}
                    {clock(firstWarning)}.
                  </p>
                )}
                {s.phase === "docked" && worst && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    In the real record, the heaviest rain ({worst.precipMmPerHour?.toFixed(1)} mm/h) arrived at {clock(Date.parse(worst.time))}
                    {Date.parse(worst.time) > s.dockAt ? `, ${Math.round((Date.parse(worst.time) - s.dockAt) / MINUTE)} min after Spot docked.` : "."}
                  </p>
                )}
              </div>
            )}
            <ReasonList reasons={s.reasons} />
            <p className="panel-inset px-3 py-2 font-mono text-xs text-muted-foreground tabular-nums">
              Conditions at {conditions ? clock(Date.parse(conditions.time)) : "-"}: rain {conditions?.precipMmPerHour?.toFixed(1) ?? "-"} mm/h · gust{" "}
              {conditions?.gustKmh?.toFixed(0) ?? "-"} km/h · {conditions?.tempC?.toFixed(0) ?? "-"} °C
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="col-span-5 animate-rise [--rise-delay:160ms]">
        <CardHeader>
          <CardTitle>Where Spot is</CardTitle>
          <CardDescription>White dot = Spot. Blue line = the round&apos;s route.</CardDescription>
        </CardHeader>
        <CardContent>
          <FacilityMap sites={sites} route={round.route} spot={s.spotAt ?? (s.phase === "docked" ? dock : undefined)} outdoor={outdoor} dock={dock} />
        </CardContent>
      </Card>
    </div>
  );
}
