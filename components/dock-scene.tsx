import { Cloud, Dome, Palm, Rain, Spot } from "@/components/intro/beats";
import "@/components/intro/intro.css";

/** What the scene shows, straight from the door rule's inputs. null = unknown. */
export type DockState = { go: boolean; rainNow: boolean | null; rainSoon: boolean | null; wetGround: boolean | null };

/**
 * The dock door drawn from data: shutter down on HOLD, rain only when it is raining now, clouds when rain is due,
 * puddles only when the water model found wet ground, and Spot waiting inside or stepping out on GO.
 */
export function DockScene({ go, rainNow, rainSoon, wetGround }: DockState) {
  const stormy = rainNow || rainSoon;
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className="size-full" role="img" aria-label={`Dock door ${go ? "open, Spot heading out" : "closed, Spot waiting inside"}${rainNow ? ", raining" : ""}${wetGround ? ", wet ground outside" : ""}`}>
      <defs>
        <linearGradient id="ds-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={stormy ? "#151c25" : "#2b4a6b"} />
          <stop offset="1" stopColor={stormy ? "#28323f" : "#6d8fb0"} />
        </linearGradient>
        <linearGradient id="ds-lamp" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.07" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <pattern id="ds-haz" width="28" height="20" patternUnits="userSpaceOnUse" patternTransform="skewX(-30)">
          <rect width="14" height="20" fill="#e0a83a" />
        </pattern>
        <clipPath id="ds-out">
          <rect x="820" y="0" width="780" height="900" />
        </clipPath>
      </defs>

      {/* Outside: the plant, sky by forecast, rain by the nowcast, puddles by the water model. */}
      <g clipPath="url(#ds-out)">
        <rect x="820" width="780" height="900" fill="url(#ds-sky)" />
        <Dome cx={1110} w={170} top={520} base={720} fill="#232c38" />
        <Dome cx={1330} w={150} top={550} base={720} fill="#202834" />
        <rect x="1190" y="400" width="16" height="320" fill="#202834" />
        <Palm x={960} y={720} s={1} />
        <Palm x={1540} y={720} s={0.85} />
        <rect x="820" y="720" width="780" height="180" fill="#1f252b" />
        {stormy && (
          <g>
            <Cloud x={820} y={60} s={1.2} fill="#2f3844" />
            <Cloud x={1080} y={10} s={1.5} fill="#38424f" />
            <Cloud x={1330} y={80} s={1.1} fill="#2f3844" />
          </g>
        )}
        {rainNow && <Rain x={830} w={770} y={200} h={520} n={60} />}
        {wetGround && (
          <g>
            {[
              [960, 760, 90, 12],
              [1180, 800, 140, 16],
              [1420, 770, 100, 12],
            ].map(([cx, cy, rx, ry]) => (
              <g key={cx}>
                <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#7ec4ff" opacity="0.28" />
                <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#8ab8ff" strokeWidth="3" />
              </g>
            ))}
          </g>
        )}
      </g>

      {/* Inside: the dock bay. */}
      <rect width="700" height="900" fill="#1f1f1f" />
      {[140, 280, 420, 560].map((x) => (
        <rect key={x} x={x} y="90" width="2" height="630" fill="#262626" />
      ))}
      <rect width="700" height="90" fill="#171717" />
      {[220, 520].map((x) => (
        <g key={x}>
          <polygon points={`${x - 30},90 ${x + 30},90 ${x + 170},720 ${x - 170},720`} fill="url(#ds-lamp)" />
          <rect x={x - 40} y="82" width="80" height="10" rx="5" fill="#f5f5f4" opacity="0.8" />
        </g>
      ))}
      <rect x="60" y="200" width="190" height="80" rx="10" fill="#262626" />
      <text x="155" y="254" textAnchor="middle" className="font-mono" fontSize="38" fontWeight="600" fill="#a8a8a2">
        DOCK 2
      </text>
      <rect y="720" width="700" height="180" fill="#181818" />
      <rect x="560" y="728" width="140" height="18" fill="url(#ds-haz)" opacity="0.8" />
      {/* Charging pad. */}
      <rect x="140" y="708" width="300" height="14" rx="4" fill="#2c2c2c" />
      <rect x="156" y="708" width="268" height="4" rx="2" fill="#4f9fe8" />

      {/* Door frame and rolling shutter: down on HOLD, up on GO. */}
      <rect x="700" y="60" width="120" height="660" fill="#2a2a2a" />
      <rect x="700" y="60" width="18" height="660" fill="#333" />
      <rect x="802" y="60" width="18" height="660" fill="#333" />
      <g className="transition-transform duration-700" transform={go ? "translate(0 -560)" : undefined}>
        <rect x="718" y="100" width="84" height="620" fill="#3a3f45" />
        {Array.from({ length: 15 }, (_, i) => (
          <rect key={i} x="718" y={100 + i * 41} width="84" height="3" fill="#2a2e33" />
        ))}
      </g>

      {/* Spot: on its pad when held, stepping through the door on GO. */}
      <g transform={go ? "translate(600 720) scale(0.9)" : "translate(130 720) scale(0.9)"}>
        <Spot />
      </g>
    </svg>
  );
}
