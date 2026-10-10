"use client";

import { useEffect, useState } from "react";

/**
 * Counts a KPI number up from 0 once on mount (~700 ms, ease-out).
 * Server HTML and reduced motion show the final value. An invisible copy of the final value
 * reserves the width, so nothing shifts while the digits change.
 */
export function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(value);

  // requestAnimationFrame is the outside system here.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(Math.round(value * (1 - (1 - t) ** 4)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return (
    <span className="relative inline-block tabular-nums">
      <span className="invisible">{value}</span>
      <span aria-hidden className="absolute inset-0">
        {shown}
      </span>
      <span className="sr-only">{value}</span>
    </span>
  );
}
