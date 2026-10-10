"use client";

import { memo, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, useSyncExternalStore, type ComponentType } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { BEATS, Mark } from "./beats";
import "./intro.css";

// Fit the 1920x1080 stage inside the window (letterboxed). 0 on the server, so nothing animates before it is visible.
const subscribe = (onChange: () => void) => {
  addEventListener("resize", onChange);
  return () => removeEventListener("resize", onChange);
};
const fit = () => Math.min(innerWidth / 1920, innerHeight / 1080);

// Pace: beats and CSS timings are authored in "design" seconds; the clock plays them this much slower.
// Looping effects (rain, beams, sweeps) keep real speed so the slow-down reads as calm, not slow motion.
const SLOW = 1.5;
const LENGTHS = BEATS.map((b) => (b.ms / 1000) * SLOW);
export const TOTAL = LENGTHS.reduce((sum, s) => sum + s, 0);
const STARTS = LENGTHS.map((_, i) => LENGTHS.slice(0, i).reduce((sum, s) => sum + s, 0));
const SPEEDS = [0.5, 1, 1.5];

// Which beat holds clock second `sec`, and how far into it (real seconds).
function locate(sec: number) {
  for (let i = BEATS.length - 1; i >= 0; i--) if (sec >= STARTS[i]) return { beat: i, local: sec - STARTS[i] };
  return { beat: 0, local: 0 };
}

const clamp = (sec: number) => Math.min(TOTAL, Math.max(0, sec));
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

// The scene only changes when the beat does; the clock re-renders the player every frame.
const SceneHost = memo(function SceneHost({ Scene }: { Scene: ComponentType }) {
  return <Scene />;
});

// The render script (scripts/render-intro.mjs) steps the frozen clock through these.
type IntroWindow = Window & { introSeek?: (sec: number) => void; introTotal?: number };

type IntroProps = { beat?: number; t?: number };

// The intro player. One clock drives everything: each frame, every CSS animation on the stage is paused and set to
// the clock, and the narration track follows it. `frozen` (?t=) holds the clock for the video render.
export function Intro({ beat: startBeat, t }: IntroProps) {
  const frozen = t !== undefined;
  const start = t ?? STARTS[startBeat ?? 0];
  const scale = useSyncExternalStore(subscribe, fit, () => 0);
  const ready = scale > 0;
  const stage = useRef<HTMLDivElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const clockRef = useRef(start);
  const [clock, setClock] = useState(start);
  const [playing, setPlaying] = useState(!frozen);
  const [speed, setSpeed] = useState(1);
  const [muted, setMuted] = useState(true);
  const [awake, setAwake] = useState(false);
  const { beat, local } = locate(clock);

  const seek = (sec: number) => {
    clockRef.current = clamp(sec);
    setClock(clockRef.current);
    if (audio.current) audio.current.currentTime = clockRef.current;
  };
  // Unmuting is a user gesture, so it may start the narration even where muted autoplay was refused.
  const toggleMute = () => {
    const a = audio.current;
    if (a && muted && playing) {
      a.currentTime = clockRef.current;
      a.play().catch(() => {});
    }
    setMuted(!muted);
  };
  const toggle = () => {
    if (!playing && clockRef.current >= TOTAL) seek(0);
    setPlaying(!playing);
  };

  // The clock: advance with real time while playing.
  useEffect(() => {
    if (!ready || !playing) return;
    let last = performance.now();
    let id = requestAnimationFrame(function tick(now) {
      const next = clamp(clockRef.current + ((now - last) / 1000) * speed);
      last = now;
      clockRef.current = next;
      setClock(next);
      const a = audio.current;
      if (a && !a.paused && Math.abs(a.currentTime - next) > 0.3) a.currentTime = next;
      if (next >= TOTAL) setPlaying(false);
      else id = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(id);
  }, [ready, playing, speed]);

  // Pin every animation on the stage to the clock, before paint.
  useLayoutEffect(() => {
    const el = stage.current;
    if (!ready || !el) return;
    for (const a of el.getAnimations({ subtree: true })) {
      a.pause();
      const { iterations, delay } = a.effect?.getTiming() ?? {};
      // A loop starts at its slowed delay, then runs at real speed.
      a.currentTime = iterations === Infinity ? local * 1000 - Number(delay ?? 0) * (SLOW - 1) : (local / SLOW) * 1000;
    }
    el.dataset.t = String(clock);
  }, [ready, clock, local, beat]);

  // Narration follows play, pause and speed. Muted by default (autoplay rules); the speaker button unmutes.
  useEffect(() => {
    const a = audio.current;
    if (!a || frozen) return;
    a.playbackRate = speed;
    if (!playing) {
      a.pause();
      return;
    }
    a.currentTime = clockRef.current;
    a.play().catch(() => {});
  }, [playing, speed, frozen]);

  // Controls show on mouse or key activity and hide after 2 s, so recordings stay clean.
  useEffect(() => {
    if (frozen) return;
    let timer = 0;
    const wake = () => {
      setAwake(true);
      clearTimeout(timer);
      timer = window.setTimeout(() => setAwake(false), 2000);
    };
    addEventListener("mousemove", wake);
    addEventListener("keydown", wake);
    return () => {
      clearTimeout(timer);
      removeEventListener("mousemove", wake);
      removeEventListener("keydown", wake);
    };
  }, [frozen]);

  // Keyboard: space plays or pauses, left and right jump 5 s.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === " " || e.code === "Space") toggle();
    else if (e.key === "ArrowLeft") seek(clockRef.current - 5);
    else if (e.key === "ArrowRight") seek(clockRef.current + 5);
    else return;
    e.preventDefault();
  });
  useEffect(() => {
    if (frozen) return;
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [frozen]);

  useEffect(() => {
    if (!frozen) return;
    const w = window as IntroWindow;
    w.introSeek = (sec) => {
      clockRef.current = clamp(sec);
      setClock(clockRef.current);
    };
    w.introTotal = TOTAL;
  }, [frozen]);

  const { Scene, bg, brand } = BEATS[beat];
  const show = !frozen && awake;
  const btn = "grid h-10 min-w-10 place-items-center rounded-full px-3 text-sm font-medium hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-ring";
  return (
    <main className={`relative h-dvh w-screen overflow-hidden bg-backdrop ${show ? "" : "cursor-none"}`}>
      <div
        ref={stage}
        // Render mode (?t=) pins the stage to the top-left corner, so a screenshot clip of it never picks up the letterbox.
        className={`intro-stage absolute h-[1080px] w-[1920px] overflow-hidden text-foreground ${frozen ? "top-0 left-0 origin-top-left" : "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"} ${bg}`}
        // note: the fit factor is computed from the window; Tailwind cannot express it.
        style={{ scale: String(scale) }}
      >
        {ready && (
          <div key={beat} className="k-fade [--t:400ms] absolute inset-0">
            <SceneHost Scene={Scene} />
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

      {!frozen && <audio ref={audio} src="/intro/narration.m4a" preload="auto" muted={muted} />}
      {!frozen && (
        <div
          className={`fixed inset-x-0 bottom-0 flex items-center gap-2 bg-linear-to-t from-black/85 to-transparent px-5 pt-12 pb-4 text-white transition-opacity duration-300 ${show ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          <button type="button" className={btn} onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause aria-hidden className="size-5" /> : <Play aria-hidden className="size-5" />}
          </button>
          <button type="button" className={btn} onClick={() => seek(clock - 5)}>-5 s</button>
          <button type="button" className={btn} onClick={() => seek(clock + 5)}>+5 s</button>
          <span className="w-24 text-center font-mono text-sm tabular-nums text-white/80">{mmss(clock)} / {mmss(TOTAL)}</span>
          <input
            type="range"
            min={0}
            max={TOTAL}
            step={0.01}
            value={clock}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Scrub"
            className="h-2 flex-1 cursor-pointer accent-primary"
          />
          <div className="flex rounded-full bg-white/10 p-0.5">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                aria-pressed={speed === s}
                className={`h-8 rounded-full px-3 font-mono text-xs focus-visible:outline-2 focus-visible:outline-ring ${speed === s ? "bg-white/90 text-black" : "text-white/80 hover:bg-white/10"}`}
              >
                {s}x
              </button>
            ))}
          </div>
          <button type="button" className={btn} onClick={toggleMute} aria-label={muted ? "Unmute narration" : "Mute narration"}>
            {muted ? <VolumeX aria-hidden className="size-5" /> : <Volume2 aria-hidden className="size-5" />}
          </button>
        </div>
      )}
    </main>
  );
}
