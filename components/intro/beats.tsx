import type { ComponentType, ReactNode } from "react";
import {
  Camera, Check, Dog as DogIcon, Clock, CloudRain, Database, Droplets, MousePointer2, Pause, Route, TriangleAlert, Undo2, type LucideIcon,
} from "lucide-react";

// Scenes for the intro (app/intro). Each beat is a 1920x1080 SVG backdrop plus HTML chips on top.
// Timing lives in the class names: [--d:2.6s] is the delay from the start of the beat (see intro.css).

const TONE = {
  hold: "bg-hold text-black",
  recall: "bg-recall text-black",
  go: "bg-go text-black",
  info: "bg-primary text-black",
} as const;

type CalloutProps = { tone: keyof typeof TONE; icon?: LucideIcon; className: string; pop: string; children: ReactNode };

// Big tilted label, the beat's headline.
function Callout({ tone, icon: Icon, className, pop, children }: CalloutProps) {
  return (
    <div className={`absolute -rotate-5 ${className}`}>
      <div className={`k-pop flex items-center gap-4 rounded-[22px] px-8 py-4 text-[64px] leading-none font-bold tracking-tight shadow-[0_24px_60px_-12px_rgb(0_0_0/0.75)] ring-4 ring-white/25 ${TONE[tone]} ${pop}`}>
        {Icon && <Icon aria-hidden className="size-14" strokeWidth={2.6} />}
        {children}
      </div>
    </div>
  );
}

type ChipProps = { icon: LucideIcon; iconClass?: string; className: string; children: ReactNode };

function Chip({ icon: Icon, iconClass = "text-muted-foreground", className, children }: ChipProps) {
  return (
    <div className={`absolute flex items-center gap-3 rounded-full bg-card/95 px-6 py-3 text-[28px] font-medium shadow-[0_16px_40px_-12px_rgb(0_0_0/0.8)] ring-1 ring-white/10 ${className}`}>
      <Icon aria-hidden className={`size-8 ${iconClass}`} />
      {children}
    </div>
  );
}

// The Kairos mark, as in the console sidebar: a dog glyph on the accent square.
export function Mark({ className }: { className: string }) {
  return (
    <span className={`grid place-items-center rounded-[24%] bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] ${className}`}>
      <DogIcon aria-hidden className="size-[58%]" />
    </span>
  );
}

// A generic pixel quadruped (our own design). Local units, feet on y = 0, facing right, about 30 x 17 units.
function Leg({ x, far, className }: { x: number; far?: boolean; className: string }) {
  return (
    <g className={`dog-leg ${className}`}>
      <rect x={x} y={-9} width={2.2} height={8.2} fill={far ? "#8f8d87" : "#dcdad4"} />
      <rect x={x} y={-5} width={2.2} height={1} fill={far ? "#2a2a2a" : "#3a3a3a"} />
      <rect x={x - 0.3} y={-1} width={2.8} height={1} fill="#1f1f1f" />
    </g>
  );
}

function Dog({ s = 7, gait = "idle" }: { s?: number; gait?: "idle" | "walk" | "b2" | "in" }) {
  return (
    <g transform={`scale(${s})`} className={`gait-${gait}`}>
      <ellipse cx="15" cy="0.2" rx="13" ry="1.3" fill="#000" opacity="0.35" />
      <Leg x={21.5} far className="leg-b" />
      <Leg x={7.5} far className="leg-a" />
      <g className="dog-body">
        <rect x="4" y="-14" width="19" height="6.5" rx="1" fill="#ecebe7" />
        <rect x="4" y="-9.2" width="19" height="1.7" fill="#c3c1ba" />
        <rect x="6" y="-12" width="12" height="0.9" fill="#4f9fe8" />
        <rect x="8" y="-15.5" width="9" height="1.6" fill="#3a3a3a" />
        <rect x="15" y="-15.2" width="1.2" height="1" fill="#7ec4ff" />
        <rect x="22" y="-16" width="7.5" height="6.5" rx="1" fill="#ecebe7" />
        <rect x="24" y="-14.6" width="5.5" height="3" rx="0.6" fill="#161616" />
        <g className="dog-eyes" fill="#7ec4ff">
          <rect x="25" y="-13.8" width="1.2" height="1.5" />
          <rect x="27.4" y="-13.8" width="1.2" height="1.5" />
        </g>
      </g>
      <Leg x={19} className="leg-a" />
      <Leg x={5} className="leg-b" />
    </g>
  );
}

function Cloud({ x, y, s, fill }: { x: number; y: number; s: number; fill: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill={fill}>
      <circle cx="60" cy="50" r="42" />
      <circle cx="120" cy="34" r="56" />
      <circle cx="180" cy="56" r="38" />
      <rect x="40" y="56" width="160" height="36" rx="18" />
    </g>
  );
}

function Palm({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill="#1a2129">
      <path d="M0 0 C 4 -60 -4 -120 10 -180" fill="none" stroke="#1a2129" strokeWidth="10" />
      {[-160, -120, -75, -30, 10].map((a) => (
        <path key={a} transform={`rotate(${a} 10 -180)`} d="M10 -180 C 40 -200 80 -195 110 -170 C 80 -185 40 -186 10 -176 Z" />
      ))}
    </g>
  );
}

// Containment dome: cylinder plus a half circle on top.
function Dome({ cx, w, top, fill }: { cx: number; w: number; top: number; fill: string }) {
  const r = w / 2;
  return <path d={`M${cx - r} 820 V${top} A${r} ${r} 0 0 1 ${cx + r} ${top} V820 Z`} fill={fill} />;
}

// note: fixed pseudo-random spots so server and client render the same rain.
const RAIN = Array.from({ length: 70 }, (_, i) => [1140 + ((i * 137) % 780), 300 + ((i * 263) % 540)]);

/* Beat 1: Spot waits at the dock door; rain rolls in; HOLD. */
function DockBeat() {
  return (
    <>
      <svg viewBox="0 0 1920 1080" className="absolute inset-0 size-full" aria-hidden>
        <defs>
          <linearGradient id="b1-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#202a36" />
            <stop offset="1" stopColor="#36445a" />
          </linearGradient>
          <linearGradient id="b1-beam" x1="0" x2="1">
            <stop offset="0" stopColor="#4f9fe8" stopOpacity="0.5" />
            <stop offset="1" stopColor="#4f9fe8" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="b1-lamp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.07" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <pattern id="b1-haz" width="28" height="20" patternUnits="userSpaceOnUse" patternTransform="skewX(-30)">
            <rect width="14" height="20" fill="#e0a83a" />
          </pattern>
          <clipPath id="b1-out"><rect x="1130" y="0" width="790" height="1080" /></clipPath>
          <clipPath id="b1-rain"><rect x="1130" y="250" width="790" height="595" /></clipPath>
        </defs>

        {/* Outside: dusk sky, the plant skyline, palms. */}
        <g clipPath="url(#b1-out)">
          <rect x="1130" width="790" height="1080" fill="url(#b1-sky)" />
          <Dome cx={1420} w={170} top={600} fill="#2a3442" />
          <Dome cx={1640} w={150} top={630} fill="#26303c" />
          <rect x="1500" y="470" width="16" height="350" fill="#26303c" />
          <rect x="1730" y="660" width="200" height="160" fill="#222b36" />
          <Palm x={1270} y={820} s={1.1} />
          <Palm x={1860} y={820} s={0.9} />
          <rect x="1130" y="820" width="790" height="260" fill="#23292f" />
          <rect className="k-fade [--d:0.6s] [--t:2.4s]" x="1130" width="790" height="820" fill="#0a0f15" opacity="0.5" />
          <g className="k-drift [--d:0.1s]">
            <Cloud x={1120} y={120} s={1.3} fill="#3a4452" />
            <Cloud x={1400} y={60} s={1.6} fill="#465163" />
            <Cloud x={1660} y={140} s={1.2} fill="#3a4452" />
            <Cloud x={1300} y={210} s={1} fill="#2f3844" />
          </g>
          <g className="k-fade [--d:1.2s]">
            <g clipPath="url(#b1-rain)">
              <g className="k-rain" stroke="#9ccfff" strokeOpacity="0.6" strokeWidth="3" strokeLinecap="round">
                {RAIN.map(([x, y]) => <line key={`${x}-${y}`} x1={x} y1={y} x2={x - 8} y2={y + 34} />)}
              </g>
            </g>
            <g className="k-splash" fill="none" stroke="#9ccfff" strokeWidth="2.5">
              {[1180, 1290, 1350, 1420, 1530, 1650, 1760, 1850].map((x) => <ellipse key={x} cx={x} cy="842" rx="16" ry="4" />)}
            </g>
            <rect x="1130" y="820" width="790" height="8" fill="#7ec4ff" opacity="0.25" />
          </g>
        </g>

        {/* Inside: the dock bay. */}
        <rect width="1060" height="1080" fill="#1f1f1f" />
        {[200, 400, 600, 800].map((x) => <rect key={x} x={x} y="110" width="2" height="710" fill="#262626" />)}
        <rect width="1060" height="110" fill="#171717" />
        {[300, 760].map((x) => (
          <g key={x}>
            <polygon points={`${x - 40},110 ${x + 40},110 ${x + 220},820 ${x - 220},820`} fill="url(#b1-lamp)" />
            <rect x={x - 50} y="100" width="100" height="12" rx="6" fill="#f5f5f4" opacity="0.8" />
          </g>
        ))}
        <rect x="90" y="250" width="230" height="96" rx="12" fill="#262626" />
        <text x="205" y="314" textAnchor="middle" className="font-mono" fontSize="44" fontWeight="600" fill="#a8a8a2">DOCK 2</text>
        <rect y="820" width="1060" height="260" fill="#181818" />
        <rect y="820" width="1060" height="3" fill="#2e2e2e" />
        <rect x="900" y="828" width="160" height="22" fill="url(#b1-haz)" opacity="0.8" />
        <ellipse cx="535" cy="822" rx="190" ry="18" fill="#4f9fe8" opacity="0.12" />
        <rect x="380" y="806" width="310" height="16" rx="4" fill="#2c2c2c" />
        <rect x="400" y="806" width="270" height="4" rx="2" fill="#4f9fe8" />

        {/* Wall and roll-up door, in section. */}
        <rect x="1060" y="110" width="70" height="320" fill="#2c2c2c" />
        <rect x="1060" y="820" width="70" height="260" fill="#141414" />
        <rect x="1048" y="420" width="94" height="52" rx="10" fill="#3a3a3a" />
        <rect x="1082" y="472" width="28" height="348" fill="#4a5058" />
        {[510, 550, 590, 630, 670, 710, 750, 790].map((y) => <rect key={y} x="1082" y={y} width="28" height="3" fill="#3a3f45" />)}
        <polygon points="1130,404 1270,424 1270,436 1130,436" fill="#2e3540" />
        <circle cx="1000" cy="446" r="18" fill="#2a2a2a" />
        <circle cx="1000" cy="446" r="10" fill="#555" />
        <circle className="k-fade [--d:2.6s]" cx="1000" cy="446" r="10" fill="#e0a83a" />
        <circle className="k-pulse [--d:2.6s]" cx="1000" cy="446" r="12" fill="none" stroke="#e0a83a" strokeWidth="3" />

        {/* Spot checks the door before it opens. */}
        <g className="k-fade [--d:1.4s]">
          <polygon className="k-shimmer" points="628,712 1080,520 1080,812 628,728" fill="url(#b1-beam)" />
          <g stroke="#7ec4ff" strokeWidth="4" strokeLinecap="round">
            {[560, 666, 772].map((y) => <line key={y} className="k-flow" x1="632" y1="720" x2="1076" y2={y} />)}
          </g>
        </g>
        <g transform="translate(430 812)"><Dog /></g>
      </svg>

      <Chip icon={Clock} className="k-rise [--d:0.3s] left-[90px] top-[150px]">Round 7 · launch 9:00 PM</Chip>
      <Chip icon={CloudRain} iconClass="text-link" className="k-rise [--d:1.6s] left-[1290px] top-[360px]">Rain 3.2 mm/h · NWS + Open-Meteo</Chip>
      <Callout tone="hold" icon={Pause} pop="[--d:2.6s]" className="left-[150px] top-[430px]">HOLD · rain at the door</Callout>
      <Chip icon={Clock} iconClass="text-go" className="k-rise [--d:3.4s] left-[240px] top-[570px]">Next safe launch 10:00 PM</Chip>
    </>
  );
}

/* Beat 2: mid-route, a storm closes in on the plant; RECALL; Spot turns for home. */
function RouteBeat() {
  return (
    <>
      <svg viewBox="0 0 1920 1080" className="absolute inset-0 size-full" aria-hidden>
        <defs>
          <linearGradient id="b2-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1b232d" />
            <stop offset="1" stopColor="#323e4d" />
          </linearGradient>
        </defs>
        <rect width="1920" height="1080" fill="url(#b2-sky)" />
        <g className="k-drift [--t:3s]">
          <Cloud x={980} y={40} s={1.8} fill="#141a21" />
          <Cloud x={1380} y={90} s={1.5} fill="#11161c" />
          <Cloud x={700} y={110} s={1.2} fill="#181f27" />
        </g>
        <Dome cx={700} w={170} top={600} fill="#2a3442" />
        <Dome cx={910} w={150} top={630} fill="#26303c" />
        <rect x="1000" y="640" width="260" height="180" fill="#232c37" />
        <rect x="780" y="470" width="16" height="350" fill="#26303c" />
        <Palm x={1500} y={790} s={1.2} />
        <Palm x={1780} y={790} />
        <rect y="760" width="1920" height="320" fill="#1f252b" />
        {/* Pipe rack. */}
        <g fill="#2f3842">
          {[330, 620, 910, 1200].map((x) => <rect key={x} x={x} y="690" width="12" height="80" />)}
          <rect x="300" y="690" width="940" height="14" rx="7" />
          <rect x="300" y="716" width="940" height="10" rx="5" fill="#3a3f45" />
        </g>
        <rect y="812" width="1920" height="52" fill="#2a3038" />
        <line x1="0" y1="838" x2="1920" y2="838" stroke="#4f9fe8" strokeOpacity="0.45" strokeWidth="4" strokeDasharray="18 14" />
        {[{ x: 560, t: "WP 5" }, { x: 1060, t: "WP 6" }].map(({ x, t }) => (
          <g key={t}>
            <rect x={x} y="730" width="4" height="84" fill="#a8a8a2" />
            <polygon points={`${x + 4},730 ${x + 44},742 ${x + 4},754`} fill="#4f9fe8" />
            <text x={x - 6} y="720" className="font-mono" fontSize="24" fill="#a8a8a2">{t}</text>
          </g>
        ))}
        {/* The dock Spot returns to. */}
        <rect y="440" width="250" height="372" fill="#2a2f36" />
        <rect y="420" width="270" height="24" fill="#323842" />
        <rect x="150" y="640" width="90" height="172" fill="#1b2a3a" />
        <rect x="150" y="640" width="90" height="172" fill="#4f9fe8" opacity="0.2" />
        <text x="30" y="520" className="font-mono" fontSize="34" fontWeight="600" fill="#a8a8a2">DOCK 2</text>
        <g transform="translate(260 836)">
          <g className="b2-track">
            <g className="b2-face"><Dog s={6} gait="b2" /></g>
          </g>
        </g>
        <rect className="k-flash [--d:2.45s]" width="1920" height="1080" fill="#fff" />
      </svg>

      <div className="absolute top-[130px] left-[1250px] w-[600px] rounded-[30px] bg-card p-5 shadow-[0_32px_80px_-24px_rgb(0_0_0/0.9)] ring-1 ring-white/10">
        <div className="mb-4 flex items-center justify-between px-2 font-mono text-[20px] tracking-[0.12em] text-muted-foreground uppercase">
          <span>Rain radar · last 50 min</span>
          <span className="k-pop [--d:2.6s] rounded-full bg-recall px-3 py-0.5 text-black">Recall</span>
        </div>
        <svg viewBox="0 0 480 480" className="w-full rounded-[22px] bg-[#151b21]" aria-hidden>
          <path d="M262 0 C250 90 280 160 258 240 C244 320 280 400 290 480 L480 480 L480 0 Z" fill="#132235" />
          <path d="M240 0 V480 M0 240 H480" stroke="#fff" strokeOpacity="0.06" strokeWidth="2" />
          <g className="b2-storm">
            <ellipse cx="150" cy="232" rx="78" ry="56" fill="#5fce8f" opacity="0.35" />
            <ellipse cx="160" cy="228" rx="44" ry="30" fill="#e0a83a" opacity="0.65" />
            <ellipse cx="168" cy="226" rx="17" ry="12" fill="#f26d6d" opacity="0.9" />
            <ellipse cx="96" cy="350" rx="50" ry="34" fill="#5fce8f" opacity="0.3" />
            <ellipse cx="104" cy="346" rx="20" ry="14" fill="#e0a83a" opacity="0.6" />
          </g>
          <path className="k-spin" d="M240 240 L240 10 A230 230 0 0 1 402 77 Z" fill="#4f9fe8" opacity="0.12" />
          <circle cx="240" cy="240" r="90" fill="none" stroke="#fff" strokeOpacity="0.3" strokeWidth="2" strokeDasharray="6 8" />
          <circle cx="240" cy="240" r="200" fill="none" stroke="#fff" strokeOpacity="0.3" strokeWidth="2" strokeDasharray="6 8" />
          <text x="246" y="144" className="font-mono" fontSize="16" fill="#a8a8a2">20 km</text>
          <text x="246" y="34" className="font-mono" fontSize="16" fill="#a8a8a2">50 km</text>
          <circle cx="240" cy="240" r="10" fill="#4f9fe8" stroke="#fff" strokeWidth="3" />
          <circle className="k-fade [--d:2.5s]" cx="240" cy="240" r="10" fill="#f26d6d" stroke="#fff" strokeWidth="3" />
          <circle className="k-pulse [--d:2.5s]" cx="240" cy="240" r="12" fill="none" stroke="#f26d6d" strokeWidth="3" />
          <text x="256" y="270" fontSize="18" fontWeight="600" fill="#f5f5f4">St. Lucie</text>
        </svg>
      </div>

      <Chip icon={Route} className="k-rise [--d:0.3s] left-[90px] top-[150px]">Round 7 · WP 6 of 12</Chip>
      <Callout tone="recall" icon={TriangleAlert} pop="[--d:2.6s]" className="left-[150px] top-[300px]">RECALL · storm inside 20 km</Callout>
      <Chip icon={Undo2} iconClass="text-recall" className="k-rise [--d:3.4s] left-[230px] top-[440px]">Spot heads back to the dock</Chip>
    </>
  );
}

// Floor seam at depth y: the corridor's floor edges run from the bottom corners to (770|1150, 560).
const SEAMS = [600, 650, 720, 820, 960].map((y) => ({ y, w: (770 * (1080 - y)) / 520 }));

/* Beat 3: Spot's camera view; the water model boxes a tiny puddle; Spot pauses; the operator confirms. */
function PuddleBeat() {
  return (
    <>
      <svg viewBox="0 0 1920 1080" className="absolute inset-0 size-full" aria-hidden>
        <defs>
          <linearGradient id="b3-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2a2d31" />
            <stop offset="1" stopColor="#44494f" />
          </linearGradient>
          <linearGradient id="b3-scan" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4f9fe8" stopOpacity="0" />
            <stop offset="1" stopColor="#4f9fe8" stopOpacity="0.5" />
          </linearGradient>
          <radialGradient id="b3-vig" cx="0.5" cy="0.5" r="0.75">
            <stop offset="0.55" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.6" />
          </radialGradient>
        </defs>
        <rect width="1920" height="1080" fill="#1c1e21" />
        <g className="b3-dolly">
          <g className="b3-bob">
            <polygon points="0,0 1920,0 1150,380 770,380" fill="#1c1e21" />
            <polygon points="0,0 770,380 770,560 0,1080" fill="#2a2d31" />
            <polygon points="1920,0 1150,380 1150,560 1920,1080" fill="#26292d" />
            <polygon points="0,1080 770,560 1150,560 1920,1080" fill="url(#b3-floor)" />
            <rect x="770" y="380" width="380" height="180" fill="#1e2023" />
            <rect x="910" y="430" width="100" height="130" fill="#4f9fe8" opacity="0.15" />
            {SEAMS.map(({ y, w }) => <line key={y} x1={w} y1={y} x2={1920 - w} y2={y} stroke="#000" strokeOpacity="0.2" strokeWidth="3" />)}
            <line x1="420" y1="1080" x2="900" y2="560" stroke="#e0a83a" strokeOpacity="0.7" strokeWidth="10" />
            <line x1="1500" y1="1080" x2="1030" y2="560" stroke="#e0a83a" strokeOpacity="0.7" strokeWidth="10" />
            {[[60, 160], [180, 250], [290, 310]].map(([y, h]) => (
              <polygon key={y} points={`${960 - h},${y} ${960 + h},${y} ${960 + h * 0.85},${y + 24} ${960 - h * 0.85},${y + 24}`} fill="#f5f5f4" opacity="0.55" />
            ))}
            <polygon points="1920,185 1150,416 1150,424 1920,225" fill="#4a5866" />
            <polygon points="1920,285 1150,440 1150,446 1920,315" fill="#6e4a3c" />
            <circle cx="300" cy="420" r="42" fill="#e9e7e1" />
            <line x1="300" y1="420" x2="322" y2="398" stroke="#f26d6d" strokeWidth="5" strokeLinecap="round" />
            <circle cx="560" cy="455" r="22" fill="#d9d7d1" />
            <rect x="420" y="520" width="90" height="120" rx="6" fill="#3a3f45" />
            {/* The tiny puddle. */}
            <path d="M1005 760 C1010 744 1060 742 1090 748 C1125 754 1122 772 1090 776 C1060 781 1000 778 1005 760 Z" fill="#8fb5d6" opacity="0.45" />
            <ellipse className="k-shimmer" cx="1068" cy="755" rx="20" ry="3" fill="#fff" opacity="0.6" />
          </g>
        </g>
        <rect className="b3-scan [--d:0.5s]" y="0" width="1920" height="60" fill="url(#b3-scan)" />
        <rect width="1920" height="1080" fill="url(#b3-vig)" />
        {/* Detection box: the puddle's bounds after the dolly (scale 1.12 about 960,520), padded. */}
        <rect className="k-draw [--d:2.2s]" pathLength={1} x="986" y="750" width="178" height="82" rx="14" fill="none" stroke="#4f9fe8" strokeWidth="4" />
        <g fill="none" stroke="#f5f5f4" strokeOpacity="0.75" strokeWidth="5" strokeLinecap="round">
          <path d="M60 140 V60 H140 M1780 60 H1860 V140 M1860 940 V1020 H1780 M140 1020 H60 V940" />
        </g>
      </svg>

      <div className="k-pop [--d:2.45s] absolute top-[700px] left-[986px] rounded-full bg-primary px-4 py-1 font-mono text-[26px] font-semibold text-black">water 0.91</div>
      <div className="k-fade [--d:0.3s] absolute top-[60px] right-[180px] flex items-center gap-2 rounded-full bg-black/55 px-5 py-2 font-mono text-[24px] text-white/90 ring-1 ring-white/15">
        <Droplets aria-hidden className="size-6 text-link" /> kairos water model
      </div>
      <div className="absolute bottom-[56px] left-[100px] flex items-center gap-3 font-mono text-[24px] text-white/80">
        <span className="k-shimmer size-4 rounded-full bg-recall" /> SPOT FRONT CAM · WP 7 · 21:14:08
      </div>

      <Callout tone="hold" icon={Pause} pop="[--d:2.9s]" className="left-[150px] top-[250px]">Spot paused</Callout>
      <div className="k-rise [--d:3.4s] absolute top-[760px] left-[1290px] w-[560px] rounded-[24px] bg-card p-6 shadow-[0_32px_80px_-24px_rgb(0_0_0/0.9)] ring-1 ring-white/10">
        <p className="text-[30px] font-semibold">Water on route · WP 7</p>
        <p className="mt-1 font-mono text-[20px] text-muted-foreground">kairos water model · 0.91</p>
        <div className="mt-4 flex gap-3 text-[24px] font-semibold">
          <span className="k-press [--d:4.3s] relative overflow-hidden rounded-xl bg-primary px-6 py-2 text-black">
            Confirm
            <span className="k-fade [--d:4.4s] absolute inset-0 grid place-items-center bg-go"><Check aria-hidden className="size-7" strokeWidth={3} /></span>
          </span>
          <span className="rounded-xl bg-secondary px-6 py-2 text-foreground">Dismiss</span>
        </div>
      </div>
      <MousePointer2 aria-hidden className="k-cursor [--d:3.6s] absolute top-[895px] left-[1395px] size-12 fill-white text-black" />
      <Callout tone="go" icon={Check} pop="[--d:4.5s]" className="left-[200px] top-[400px]">Operator confirms</Callout>
    </>
  );
}

// A small copy of the puddle frame that rides the pipeline.
function Thumb({ className }: { className: string }) {
  return (
    <div className={`absolute overflow-hidden rounded-xl shadow-[0_12px_30px_-8px_rgb(0_0_0/0.8)] ring-2 ring-white/80 ${className}`}>
      <svg viewBox="0 0 150 96" className="size-full" aria-hidden>
        <rect width="150" height="96" fill="#2a2d31" />
        <polygon points="0,96 55,48 95,48 150,96" fill="#3d4247" />
        <ellipse cx="82" cy="74" rx="14" ry="4" fill="#8fb5d6" opacity="0.8" />
        <rect x="62" y="63" width="40" height="22" rx="5" fill="none" stroke="#4f9fe8" strokeWidth="2.5" />
      </svg>
    </div>
  );
}

type NodeProps = { icon: LucideIcon; title: string; sub: string; className: string; rise: string; ping: string };

// Pipeline node: icon tile with its name under it. className positions the 136 px tile (top-left corner).
function Node({ icon: Icon, title, sub, className, rise, ping }: NodeProps) {
  return (
    <div className={`k-rise absolute w-[136px] ${rise} ${className}`}>
      <div className="relative grid size-[136px] place-items-center rounded-[32px] bg-[#13233a] shadow-[0_0_60px_-10px_rgb(79_159_232/0.55)] ring-2 ring-primary/60">
        <Icon aria-hidden className="size-14 text-link" strokeWidth={1.8} />
        <span className={`k-ping absolute inset-0 rounded-[32px] ring-4 ring-link ${ping}`} />
      </div>
      <div className="absolute top-[156px] left-1/2 w-[440px] -translate-x-1/2 text-center">
        <p className="text-[30px] font-semibold">{title}</p>
        <p className="text-[21px] text-white/60">{sub}</p>
      </div>
    </div>
  );
}

function Pill({ tone, className, pop, children }: { tone: keyof typeof TONE; className: string; pop: string; children: ReactNode }) {
  return (
    <div className={`absolute -translate-x-1/2 ${className}`}>
      <div className={`k-pop rounded-full px-5 py-1.5 font-mono text-[24px] font-semibold whitespace-nowrap ${TONE[tone]} ${pop}`}>{children}</div>
    </div>
  );
}

/* Beat 4: how it works, as a pipeline. Tile centers x = 300, 760, 1220, 1680 on y = 400; Neon below the rules at y = 800. */
function PipelineBeat() {
  return (
    <>
      <svg viewBox="0 0 1920 1080" className="absolute inset-0 size-full" aria-hidden>
        <defs>
          <pattern id="b4-grid" width="80" height="80" patternUnits="userSpaceOnUse">
            <path d="M80 0 H0 V80" fill="none" stroke="#fff" strokeOpacity="0.035" strokeWidth="2" />
          </pattern>
        </defs>
        <rect width="1920" height="1080" fill="url(#b4-grid)" />
        <g className="k-fade [--d:1s]" stroke="#4f9fe8" strokeWidth="5" strokeLinecap="round" fill="#4f9fe8">
          {[382, 842, 1302].map((x) => (
            <g key={x}>
              <line className="k-flow" x1={x} y1="400" x2={x + 286} y2="400" />
              <polygon stroke="none" points={`${x + 296},400 ${x + 282},391 ${x + 282},409`} />
            </g>
          ))}
          <line className="k-flow" x1="1220" y1="610" x2="1220" y2="706" />
          <polygon stroke="none" points="1220,716 1211,702 1229,702" />
        </g>
      </svg>

      <Callout tone="info" pop="[--d:0.1s]" className="left-[150px] top-[120px]">HOW IT WORKS</Callout>
      <Node icon={Camera} title="Spot camera" sub="frames from the route" rise="[--d:0.3s]" ping="[--d:1.3s]" className="top-[332px] left-[232px]" />
      <Node icon={Droplets} title="Hugging Face water model" sub="runs in the browser" rise="[--d:0.45s]" ping="[--d:2.25s]" className="top-[332px] left-[692px]" />
      <Node icon={CloudRain} title="Kairos rules" sub="NWS + Open-Meteo weather" rise="[--d:0.6s]" ping="[--d:3.3s]" className="top-[332px] left-[1152px]" />
      <Node icon={Route} title="Orbit" sub="pause or recall the round" rise="[--d:0.75s]" ping="[--d:4.4s]" className="top-[332px] left-[1612px]" />
      <Node icon={Database} title="Neon" sub="evidence log" rise="[--d:0.9s]" ping="[--d:4.4s]" className="top-[732px] left-[1152px]" />

      <Thumb className="k-hop [--d:1.3s] top-[352px] left-[455px] h-[96px] w-[150px]" />
      <Thumb className="k-hop [--d:2.35s] top-[352px] left-[915px] h-[96px] w-[150px]" />
      <Thumb className="k-hop [--d:3.45s] top-[352px] left-[1375px] h-[96px] w-[150px]" />
      <Thumb className="k-hop-down [--d:3.45s] top-[624px] left-[1160px] h-[76px] w-[120px]" />

      <Pill tone="info" pop="[--d:2.3s]" className="top-[262px] left-[760px]">water 0.91</Pill>
      <Pill tone="hold" pop="[--d:3.35s]" className="top-[262px] left-[1220px]">HOLD · pause</Pill>
      <Pill tone="hold" pop="[--d:4.45s]" className="top-[262px] left-[1680px]">round paused</Pill>
      <Pill tone="go" pop="[--d:4.5s]" className="top-[776px] left-[1440px]">evidence logged</Pill>
    </>
  );
}

/* Beat 5: outro. */
function OutroBeat() {
  return (
    <>
      <div className="absolute inset-x-0 top-[200px] flex flex-col items-center text-center">
        <Mark className="k-pop [--d:0.2s] size-[150px] shadow-[0_0_80px_-10px_rgb(79_159_232/0.7)]" />
        <p className="k-rise [--d:0.5s] mt-8 text-[150px] leading-none font-bold tracking-tight">Kairos</p>
        <p className="k-rise [--d:0.9s] mt-8 text-[44px] text-white/80">Weather and water checks for Spot, inside Orbit</p>
        <p className="k-rise [--d:1.3s] mt-6 font-mono text-[36px] text-link">kairos.boston</p>
      </div>
      <svg viewBox="0 0 1920 1080" className="absolute inset-0 size-full" aria-hidden>
        <g transform="translate(885 990)">
          <g className="k-walkin [--d:0.6s]"><Dog s={5} gait="in" /></g>
        </g>
      </svg>
    </>
  );
}

export type Beat = { ms: number; Scene: ComponentType; bg: string; brand: boolean };

// Total 29.5 s.
export const BEATS: Beat[] = [
  { ms: 6000, Scene: DockBeat, bg: "bg-background", brand: true },
  { ms: 5500, Scene: RouteBeat, bg: "bg-background", brand: true },
  { ms: 6500, Scene: PuddleBeat, bg: "bg-background", brand: false },
  { ms: 6500, Scene: PipelineBeat, bg: "bg-[radial-gradient(ellipse_at_center,#14253b,#0b121c_70%)]", brand: true },
  { ms: 5000, Scene: OutroBeat, bg: "bg-[radial-gradient(ellipse_at_center,#14253b,#0b121c_70%)]", brand: false },
];
