"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { RotateCcw } from "lucide-react";
import { BEATS, Mark } from "./beats";
import "./intro.css";

// Fit the 1920x1080 stage inside the window (letterboxed). 0 on the server, so nothing animates before it is visible.
const subscribe = (onChange: () => void) => {
  addEventListener("resize", onChange);
  return () => removeEventListener("resize", onChange);
};
const fit = () => Math.min(innerWidth / 1920, innerHeight / 1080);

export const TOTAL = BEATS.reduce((sum, b) => sum + b.ms, 0) / 1000;

// Which beat holds global second `sec`, and how far into that beat it is.
function locate(sec: number) {
  let start = 0;
  for (const [i, b] of BEATS.entries()) {
    if (sec < start + b.ms / 1000) return { beat: i, local: sec - start };
    start += b.ms / 1000;
  }
  return { beat: BEATS.length - 1, local: BEATS[BEATS.length - 1].ms / 1000 };
}

// The render script (scripts/render-intro.mjs) steps the frozen clock through these.
type IntroWindow = Window & { introSeek?: (sec: number) => void; introTotal?: number };

type IntroProps = { only?: number; t?: number };

// Self-playing intro. `only` (0-based) plays one beat and holds it. `t` freezes the whole timeline at that second.
export function Intro({ only, t }: IntroProps) {
  const scale = useSyncExternalStore(subscribe, fit, () => 0);
  const ready = scale > 0;
  const stage = useRef<HTMLDivElement>(null);
  const [beat, setBeat] = useState(only ?? 0);
  const [single, setSingle] = useState(only !== undefined);
  const [done, setDone] = useState(false);
  const [run, setRun] = useState(0);
  const [seek, setSeek] = useState(t);
  const frozen = seek !== undefined;
  const shown = frozen ? locate(seek).beat : beat;

  // Advance the timeline. The timer is the outside system; CSS does the motion inside each beat.
  useEffect(() => {
    if (!ready || done || frozen) return;
    const timer = setTimeout(() => {
      if (single || beat === BEATS.length - 1) setDone(true);
      else setBeat(beat + 1);
    }, BEATS[beat].ms);
    return () => clearTimeout(timer);
  }, [ready, done, frozen, beat, single, run]);

  // Frozen clock: pause every animation on the stage at the same moment, before paint.
  useLayoutEffect(() => {
    const el = stage.current;
    if (!ready || seek === undefined || !el) return;
    const ms = locate(seek).local * 1000;
    for (const a of el.getAnimations({ subtree: true })) {
      a.pause();
      a.currentTime = ms;
    }
    el.dataset.t = String(seek);
  }, [ready, seek]);

  useEffect(() => {
    if (t === undefined) return;
    const w = window as IntroWindow;
    w.introSeek = setSeek;
    w.introTotal = TOTAL;
  }, [t]);

  const replay = () => {
    setBeat(0);
    setSingle(false);
    setDone(false);
    setRun(run + 1);
  };

  const { Scene, bg, brand } = BEATS[shown];
  return (
    <main className={`relative h-dvh w-screen overflow-hidden bg-backdrop ${done ? "" : "cursor-none"}`}>
      <div
        ref={stage}
        className={`intro-stage absolute top-1/2 left-1/2 h-[1080px] w-[1920px] -translate-x-1/2 -translate-y-1/2 overflow-hidden text-foreground ${bg}`}
        // note: the fit factor is computed from the window; Tailwind cannot express it.
        style={{ scale: String(scale) }}
      >
        {ready && (
          <div key={`${run}-${shown}`} className="k-fade [--t:400ms] absolute inset-0">
            <Scene />
          </div>
        )}
        {ready && brand && (
          <div className="absolute top-8 left-10 flex items-center gap-3 text-[30px] font-semibold">
            <Mark className="size-11" /> Kairos
          </div>
        )}
        <div className="absolute right-8 bottom-6 rounded-full bg-black/45 px-4 py-1.5 font-mono text-[18px] text-white/75 ring-1 ring-white/10">
          Concept animation
        </div>
      </div>
      {done && (
        <button
          type="button"
          onClick={replay}
          className="fixed right-4 bottom-4 flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm ring-1 ring-white/10 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
        >
          <RotateCcw aria-hidden className="size-4" /> Replay
        </button>
      )}
    </main>
  );
}
