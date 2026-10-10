import type { ComponentType, ReactNode } from "react";
import {
  Camera, Check, CloudRain, Database, Droplets, Pause, Route, TriangleAlert, Undo2, type LucideIcon,
} from "lucide-react";

// Scenes for the intro (app/intro), following the StepSafe intro beat for beat.
// Each beat is a 1920x1080 SVG backdrop plus HTML chips on top.
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
      <div className={`k-pop flex items-center gap-4 rounded-[22px] px-8 py-4 text-[64px] leading-none font-bold tracking-tight whitespace-nowrap shadow-[0_24px_60px_-12px_rgb(0_0_0/0.75)] ring-4 ring-white/25 ${TONE[tone]} ${pop}`}>
        {Icon && <Icon aria-hidden className="size-14" strokeWidth={2.6} />}
        {children}
      </div>
    </div>
  );
}

type ChipProps = { icon: LucideIcon; iconClass?: string; className: string; children: ReactNode };

function Chip({ icon: Icon, iconClass = "text-muted-foreground", className, children }: ChipProps) {
  return (
    <div className={`absolute flex items-center gap-3 rounded-full bg-card/95 px-6 py-3 text-[28px] font-medium whitespace-nowrap shadow-[0_16px_40px_-12px_rgb(0_0_0/0.8)] ring-1 ring-white/10 ${className}`}>
      <Icon aria-hidden className={`size-8 ${iconClass}`} />
      {children}
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

// The Kairos mark, the same drawing as app/icon.svg on main: the lucide dog glyph on the accent square.
export function Mark({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`rounded-[25%] ${className}`} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#4f9fe8" />
      <g transform="translate(5 5) scale(0.9167)" fill="none" stroke="#0a0a0a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11.25 16.25h1.5L12 17z" />
        <path d="M16 14v.5" />
        <path d="M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444a11.702 11.702 0 0 0-.493-3.309" />
        <path d="M8 14v.5" />
        <path d="M8.5 8.5c-.384 1.05-1.083 2.028-2.344 2.5-1.931.722-3.576-.297-3.656-1-.113-.994 1.177-6.53 4-7 1.923-.321 3.651.845 3.651 2.235A7.497 7.497 0 0 1 14 5.277c0-1.39 1.844-2.598 3.767-2.277 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5" />
      </g>
    </svg>
  );
}

/* A Spot-style robot dog, our own flat drawing (no maker logo or text). Side view facing right, feet on y = 0,
   body 0..318 px long. Knees point backward. Leg pivots sit at 0,0 of their groups so CSS can turn them. */
function Leg({ x, pair, far }: { x: number; pair: "a" | "b"; far?: boolean }) {
  const thigh = far ? "#3b3b3b" : "#242424";
  const shin = far ? "#2c2c2c" : "#121212";
  return (
    <g transform={`translate(${x} -137)`} className={`leg-${pair}`}>
      <g className="thigh">
        <line x2="-24" y2="66" stroke={thigh} strokeWidth="22" strokeLinecap="round" />
        <g transform="translate(-24 66)">
          <g className="shin">
            <line x2="24" y2="64" stroke={shin} strokeWidth="14" strokeLinecap="round" />
            <ellipse cx="26" cy="64" rx="13" ry="7" fill={shin} />
          </g>
          <circle r="11" fill={far ? "#4a4a4a" : "#363636"} />
        </g>
      </g>
      <circle r="16" fill={far ? "#2a2a2a" : "#1b1b1b"} />
    </g>
  );
}

function Spot({ walk }: { walk?: "route" | "storm" }) {
  return (
    <g className={walk ? `walk-${walk}` : undefined}>
      <ellipse cx="160" cy="3" rx="165" ry="10" fill="#000" opacity="0.35" />
      <Leg x={70} pair="a" far />
      <Leg x={262} pair="b" far />
      <g transform="translate(0 -25)">
      {/* Payload rail with a small camera dome. */}
      <rect x="105" y="-168" width="100" height="18" rx="5" fill="#1f1f1f" />
      <circle cx="188" cy="-172" r="15" fill="#2a2a2a" />
      <circle cx="191" cy="-172" r="6" fill="#4f9fe8" />
      {/* Body shell. */}
      <rect x="0" y="-154" width="300" height="54" rx="24" fill="#f2c12e" />
      <rect x="10" y="-114" width="280" height="12" rx="6" fill="#d6a41c" />
      <rect x="40" y="-146" width="190" height="6" rx="3" fill="#ffdc66" opacity="0.8" />
      <line x1="112" y1="-152" x2="112" y2="-102" stroke="#c99a17" strokeWidth="3" />
      <line x1="200" y1="-152" x2="200" y2="-102" stroke="#c99a17" strokeWidth="3" />
      <rect x="-6" y="-142" width="14" height="32" rx="6" fill="#1b1b1b" />
      {/* Front sensor head with two camera lenses. */}
      <path d="M262 -154 H294 Q320 -152 320 -128 Q320 -104 294 -100 H262 Z" fill="#1b1b1b" />
      <circle cx="298" cy="-138" r="7" fill="#3a3a3a" />
      <circle cx="298" cy="-138" r="3" fill="#7ec4ff" />
      <circle cx="298" cy="-116" r="7" fill="#3a3a3a" />
      <circle cx="298" cy="-116" r="3" fill="#7ec4ff" />
      </g>
      <Leg x={55} pair="b" />
      <Leg x={248} pair="a" />
    </g>
  );
}

// Blue scan beam from the sensor head to a span of floor (local Spot coordinates).
function Beam({ points, rays, className }: { points: string; rays: [number, number][]; className: string }) {
  return (
    <g className={className}>
      <polygon className="k-shimmer" points={points} fill="url(#beam)" />
      <g stroke="#7ec4ff" strokeWidth="4" strokeLinecap="round">
        {rays.map(([x, y]) => <line key={`${x}-${y}`} className="k-flow" x1="320" y1="-151" x2={x} y2={y} />)}
      </g>
    </g>
  );
}

const BEAM_GRADIENT = (
  <linearGradient id="beam" x1="0" x2="1">
    <stop offset="0" stopColor="#4f9fe8" stopOpacity="0.5" />
    <stop offset="1" stopColor="#4f9fe8" stopOpacity="0.06" />
  </linearGradient>
);

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

// Containment dome: cylinder plus a half circle on top, standing on y = base.
function Dome({ cx, w, top, base = 820, fill }: { cx: number; w: number; top: number; base?: number; fill: string }) {
  const r = w / 2;
  return <path d={`M${cx - r} ${base} V${top} A${r} ${r} 0 0 1 ${cx + r} ${top} V${base} Z`} fill={fill} />;
}

// Rain streaks over a box. note: fixed pseudo-random spots so server and client render the same rain.
function Rain({ x, w, y, h, n }: { x: number; w: number; y: number; h: number; n: number }) {
  return (
    <g className="k-rain" stroke="#9ccfff" strokeOpacity="0.6" strokeWidth="3" strokeLinecap="round">
      {Array.from({ length: n }, (_, i) => {
        const rx = x + ((i * 137) % w);
        const ry = y + ((i * 263) % h);
        return <line key={i} x1={rx} y1={ry} x2={rx - 8} y2={ry + 34} />;
      })}
    </g>
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

const SKY = (
  <linearGradient id="r-sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stopColor="#25313f" />
    <stop offset="1" stopColor="#3d4b5e" />
  </linearGradient>
);

// The outdoor route: sky, the plant (domes, turbine hall, stack, tanks, pipe rack, palms), Spot's dock, the walkway.
function RouteBackdrop() {
  return (
    <>
      <rect width="1920" height="1080" fill="url(#r-sky)" />
      <Dome cx={1490} w={190} top={560} base={790} fill="#2c3747" />
      <Dome cx={1710} w={160} top={600} base={790} fill="#283241" />
      <rect x="1590" y="430" width="18" height="360" fill="#283241" />
      <rect x="1250" y="630" width="160" height="160" fill="#253040" />
      <rect x="380" y="690" width="130" height="100" rx="8" fill="#2a3442" />
      <ellipse cx="445" cy="690" rx="65" ry="12" fill="#323e4e" />
      <Palm x={280} y={790} s={1.1} />
      <Palm x={1880} y={790} />
      <rect y="790" width="1920" height="290" fill="#232a31" />
      <g fill="#313b46">
        {[600, 860, 1120].map((x) => <rect key={x} x={x} y="700" width="12" height="90" />)}
        <rect x="570" y="700" width="600" height="14" rx="7" />
        <rect x="570" y="726" width="600" height="10" rx="5" fill="#3b424b" />
      </g>
      <rect y="470" width="190" height="358" fill="#2c323a" />
      <rect y="452" width="210" height="22" fill="#353c46" />
      <rect x="60" y="640" width="120" height="188" fill="#1b2a3a" />
      <rect x="60" y="640" width="120" height="188" fill="#4f9fe8" opacity="0.18" />
      <text x="20" y="540" className="font-mono" fontSize="30" fontWeight="600" fill="#a8a8a2">DOCK 2</text>
      <rect y="828" width="1920" height="52" fill="#2d343d" />
      <rect y="880" width="1920" height="200" fill="#1c2228" />
      <line x1="0" y1="872" x2="1920" y2="872" stroke="#e0a83a" strokeOpacity="0.55" strokeWidth="5" strokeDasharray="30 20" />
    </>
  );
}

/* Beat 1 (StepSafe f001-f010): Spot walks the plant route scanning the floor and finds a small puddle.
   It holds at the waypoint, the operator confirms, and the detection flies up to the Neon evidence log. */
function RouteBeat() {
  return (
    <>
      <svg viewBox="0 0 1920 1080" className="absolute inset-0 size-full" aria-hidden>
        <defs>{SKY}{BEAM_GRADIENT}</defs>
        <RouteBackdrop />
        <ellipse cx="1250" cy="855" rx="44" ry="8" fill="#8fb5d6" opacity="0.5" />
        <ellipse className="k-shimmer" cx="1262" cy="853" rx="16" ry="2.5" fill="#fff" opacity="0.6" />
        <g transform="translate(60 852)">
          <g className="route-track">
            <Beam className="k-fade [--d:0.3s]" points="320,-157 700,4 420,4 320,-145" rays={[[470, 2], [560, 2], [650, 2]]} />
            <Spot walk="route" />
          </g>
        </g>
        <rect className="k-draw [--d:3.2s]" pathLength={1} x="1192" y="828" width="116" height="54" rx="12" fill="none" stroke="#4f9fe8" strokeWidth="4" />
        <g className="k-fade [--d:5.6s]">
          <line className="k-flow" x1="1250" y1="770" x2="1250" y2="345" stroke="#7ec4ff" strokeWidth="4" strokeLinecap="round" />
        </g>
      </svg>

      <div className="k-pop [--d:3.4s] absolute top-[782px] left-[1192px] rounded-full bg-primary px-4 py-1 font-mono text-[26px] font-semibold text-black">water 87%</div>
      <div className="k-fade [--d:3.6s] absolute top-[896px] left-[1150px] flex items-center gap-2 rounded-full bg-black/55 px-4 py-1.5 font-mono text-[22px] text-white/90 ring-1 ring-white/15">
        <Droplets aria-hidden className="size-5 text-link" /> kairos water model
      </div>
      <Chip icon={Pause} iconClass="text-hold" className="k-rise [--d:3.9s] left-[700px] top-[560px]">Spot holds at WP 6</Chip>
      <Callout tone="go" icon={Check} pop="[--d:4.7s]" className="left-[180px] top-[300px]">Operator confirms</Callout>
      <div className="k-pop [--d:5.2s] absolute top-[110px] left-[1130px] flex w-[240px] flex-col items-center">
        <div className="relative grid h-[130px] w-[220px] place-items-center">
          <svg viewBox="0 0 240 150" className="absolute inset-0 size-full drop-shadow-[0_0_40px_rgb(79_159_232/0.6)]" aria-hidden>
            <Cloud x={0} y={28} s={1} fill="#4f9fe8" />
          </svg>
          <Database aria-hidden className="relative mt-4 size-14 text-black" strokeWidth={2.2} />
          <span className="k-ping [--d:6.9s] absolute inset-0 rounded-[60px] ring-4 ring-link" />
        </div>
        <p className="mt-2 text-[30px] font-semibold">Neon</p>
        <p className="text-[20px] text-white/60">evidence log</p>
      </div>
      <Thumb className="k-fly [--d:5.6s] top-[132px] left-[1175px] h-[96px] w-[150px]" />
      <Pill tone="go" pop="[--d:6.9s]" className="top-[340px] left-[1460px]">saved</Pill>
    </>
  );
}

/* Beat 2 (StepSafe f013): a dark radar-style map. St. Lucie marker, storm cells closing in, water pins on the route. */
function RadarBeat() {
  const pin = "M0 0 C-10 -14 -15 -20 -15 -29 A15 15 0 1 1 15 -29 C15 -20 10 -14 0 0 Z";
  return (
    <>
      <svg viewBox="0 0 1920 1080" className="absolute inset-0 size-full" aria-hidden>
        <defs>
          <pattern id="m-tiles" width="160" height="160" patternUnits="userSpaceOnUse">
            <rect x="8" y="8" width="144" height="144" rx="14" fill="#0f1c30" />
          </pattern>
        </defs>
        <rect width="1920" height="1080" fill="#0b1420" />
        <rect width="1920" height="1080" fill="url(#m-tiles)" />
        <path d="M1060 0 C1020 200 1040 420 1000 560 C975 700 1040 900 1060 1080 L1920 1080 L1920 0 Z" fill="#070f1a" stroke="#1e3554" strokeWidth="3" />
        <g className="radar-storm">
          <ellipse cx="790" cy="540" rx="150" ry="110" fill="#5fce8f" opacity="0.3" />
          <ellipse cx="805" cy="535" rx="90" ry="62" fill="#e0a83a" opacity="0.6" />
          <ellipse cx="818" cy="530" rx="36" ry="24" fill="#f26d6d" opacity="0.9" />
          <ellipse cx="560" cy="780" rx="110" ry="70" fill="#5fce8f" opacity="0.28" />
          <ellipse cx="575" cy="776" rx="50" ry="30" fill="#e0a83a" opacity="0.55" />
          <ellipse cx="620" cy="290" rx="80" ry="50" fill="#5fce8f" opacity="0.25" />
        </g>
        <g className="k-spin">
          <circle cx="960" cy="560" r="500" fill="none" />
          <path d="M960 560 L960 60 A500 500 0 0 1 1281 177 Z" fill="#4f9fe8" opacity="0.09" />
        </g>
        <circle cx="960" cy="560" r="200" fill="none" stroke="#fff" strokeOpacity="0.3" strokeWidth="2.5" strokeDasharray="8 10" />
        <circle cx="960" cy="560" r="440" fill="none" stroke="#fff" strokeOpacity="0.3" strokeWidth="2.5" strokeDasharray="8 10" />
        <text x="968" y="350" className="font-mono" fontSize="24" fill="#a8a8a2">20 km</text>
        <text x="968" y="110" className="font-mono" fontSize="24" fill="#a8a8a2">50 km</text>
        <circle cx="960" cy="560" r="14" fill="#4f9fe8" stroke="#fff" strokeWidth="4" />
        <circle className="k-fade [--d:2.4s]" cx="960" cy="560" r="14" fill="#f26d6d" stroke="#fff" strokeWidth="4" />
        <circle className="k-pulse [--d:2.4s]" cx="960" cy="560" r="16" fill="none" stroke="#f26d6d" strokeWidth="3" />

        {/* Site inset: the inspection route with today's water pins. */}
        <g className="k-pop [--d:0.3s]">
          <line x1="974" y1="552" x2="1120" y2="490" stroke="#4f9fe8" strokeOpacity="0.6" strokeWidth="3" />
          <rect x="1120" y="340" width="440" height="300" rx="24" fill="#13233a" stroke="#4f9fe8" strokeOpacity="0.5" strokeWidth="2" />
          <text x="1146" y="384" fontSize="24" fontWeight="600" fill="#f5f5f4">St. Lucie plant · route</text>
          <circle cx="1290" cy="500" r="40" fill="#1f3352" />
          <circle cx="1390" cy="500" r="34" fill="#1f3352" />
          <rect x="1450" y="450" width="70" height="90" rx="6" fill="#1f3352" />
          <polyline className="k-flow" points="1160,600 1520,600 1520,420 1440,420 1440,570 1180,570 1180,430" fill="none" stroke="#7ec4ff" strokeWidth="4" strokeLinecap="round" />
        </g>
        {[[1300, 600, "[--d:1s]"], [1520, 500, "[--d:1.3s]"], [1180, 480, "[--d:1.6s]"]].map(([x, y, d]) => (
          <g key={`${x}`} transform={`translate(${x} ${y})`}>
            <g className={`k-pop ${d}`}>
              <path d={pin} fill="#7ec4ff" stroke="#0b1420" strokeWidth="3" />
              <circle cy="-29" r="6" fill="#0b1420" />
            </g>
          </g>
        ))}
        <text x="960" y="612" textAnchor="middle" fontSize="26" fontWeight="600" fill="#f5f5f4">St. Lucie</text>
      </svg>

      <Chip icon={CloudRain} iconClass="text-link" className="k-rise [--d:0.2s] left-[90px] top-[140px]">Rain radar · last 50 min</Chip>
      <Chip icon={Droplets} iconClass="text-link" className="k-rise [--d:1.8s] left-[1120px] top-[670px]">3 water pins on today&apos;s route</Chip>
      <Chip icon={TriangleAlert} iconClass="text-recall" className="k-rise [--d:2.6s] left-[90px] top-[230px]">Storm cell inside 20 km</Chip>
    </>
  );
}

/* Beat 3 (StepSafe f007, where the car passes): later in the round a storm reaches the plant. The radar shows it inside
   20 km, Kairos calls RECALL, and Spot turns back to the dock. Then HOW IT WORKS. */
function StormBeat() {
  return (
    <>
      <svg viewBox="0 0 1920 1080" className="absolute inset-0 size-full" aria-hidden>
        <defs>
          {SKY}
          <clipPath id="s-rain"><rect width="1920" height="880" y="190" /></clipPath>
        </defs>
        <RouteBackdrop />
        <rect className="k-fade [--d:0.3s] [--t:2s]" width="1920" height="828" fill="#070b10" opacity="0.5" />
        <g className="k-drift [--t:2.4s]">
          <Cloud x={760} y={40} s={1.6} fill="#2b333e" />
          <Cloud x={1120} y={90} s={1.9} fill="#222932" />
          <Cloud x={1520} y={30} s={1.6} fill="#2b333e" />
          <Cloud x={420} y={110} s={1.3} fill="#262e38" />
        </g>
        <g className="k-fade [--d:1.6s]">
          <g clipPath="url(#s-rain)"><Rain x={0} w={1920} y={240} h={600} n={140} /></g>
          <g className="k-splash" fill="none" stroke="#9ccfff" strokeWidth="2.5">
            {[180, 420, 610, 780, 990, 1150, 1380, 1560, 1730, 1860].map((x) => <ellipse key={x} cx={x} cy="852" rx="16" ry="4" />)}
          </g>
        </g>
        <g transform="translate(500 852)">
          <g className="storm-track">
            <g className="storm-face"><Spot walk="storm" /></g>
          </g>
        </g>
        <rect className="k-flash [--d:2.7s]" width="1920" height="1080" fill="#fff" />
      </svg>

      <div className="absolute top-[130px] left-[1250px] w-[600px] rounded-[30px] bg-card p-5 shadow-[0_32px_80px_-24px_rgb(0_0_0/0.9)] ring-1 ring-white/10">
        <div className="mb-4 flex items-center justify-between px-2 font-mono text-[20px] tracking-[0.12em] text-muted-foreground uppercase">
          <span>Rain radar · St. Lucie</span>
          <span className="k-pop [--d:3s] rounded-full bg-recall px-3 py-0.5 text-black">Recall</span>
        </div>
        <svg viewBox="0 0 480 480" className="w-full rounded-[22px] bg-[#151b21]" aria-hidden>
          <path d="M262 0 C250 90 280 160 258 240 C244 320 280 400 290 480 L480 480 L480 0 Z" fill="#132235" />
          <path d="M240 0 V480 M0 240 H480" stroke="#fff" strokeOpacity="0.06" strokeWidth="2" />
          <g className="card-storm">
            <ellipse cx="150" cy="232" rx="78" ry="56" fill="#5fce8f" opacity="0.35" />
            <ellipse cx="160" cy="228" rx="44" ry="30" fill="#e0a83a" opacity="0.65" />
            <ellipse cx="168" cy="226" rx="17" ry="12" fill="#f26d6d" opacity="0.9" />
            <ellipse cx="96" cy="350" rx="50" ry="34" fill="#5fce8f" opacity="0.3" />
            <ellipse cx="104" cy="346" rx="20" ry="14" fill="#e0a83a" opacity="0.6" />
          </g>
          <g className="k-spin">
            <circle cx="240" cy="240" r="230" fill="none" />
            <path d="M240 240 L240 10 A230 230 0 0 1 402 77 Z" fill="#4f9fe8" opacity="0.12" />
          </g>
          <circle cx="240" cy="240" r="90" fill="none" stroke="#fff" strokeOpacity="0.3" strokeWidth="2" strokeDasharray="6 8" />
          <circle cx="240" cy="240" r="200" fill="none" stroke="#fff" strokeOpacity="0.3" strokeWidth="2" strokeDasharray="6 8" />
          <text x="246" y="144" className="font-mono" fontSize="16" fill="#a8a8a2">20 km</text>
          <text x="246" y="34" className="font-mono" fontSize="16" fill="#a8a8a2">50 km</text>
          <circle cx="240" cy="240" r="10" fill="#4f9fe8" stroke="#fff" strokeWidth="3" />
          <circle className="k-fade [--d:2.9s]" cx="240" cy="240" r="10" fill="#f26d6d" stroke="#fff" strokeWidth="3" />
          <circle className="k-pulse [--d:2.9s]" cx="240" cy="240" r="12" fill="none" stroke="#f26d6d" strokeWidth="3" />
          <text x="256" y="270" fontSize="18" fontWeight="600" fill="#f5f5f4">St. Lucie</text>
        </svg>
      </div>

      <Chip icon={Route} className="k-rise [--d:0.3s] left-[90px] top-[150px]">Round 7 · WP 9 of 12</Chip>
      <Callout tone="recall" icon={TriangleAlert} pop="[--d:3s]" className="left-[150px] top-[290px]">RECALL · storm inside 20 km</Callout>
      <Chip icon={Undo2} iconClass="text-recall" className="k-rise [--d:3.8s] left-[230px] top-[430px]">Spot heads back to the dock</Chip>
      <div className="k-fade [--d:6.4s] absolute inset-0 bg-black/50" />
      <Callout tone="info" pop="[--d:6.6s]" className="left-[760px] top-[520px]">HOW IT WORKS</Callout>
    </>
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

/* Beat 4 (StepSafe f022-f025): how it works, as a pipeline. Tile centers x = 300, 760, 1220, 1680 on y = 400; Neon below the dashboard. */
function PipelineBeat() {
  return (
    <>
      <svg viewBox="0 0 1920 1080" className="absolute inset-0 size-full" aria-hidden>
        <defs>
          <pattern id="p-grid" width="80" height="80" patternUnits="userSpaceOnUse">
            <path d="M80 0 H0 V80" fill="none" stroke="#fff" strokeOpacity="0.035" strokeWidth="2" />
          </pattern>
        </defs>
        <rect width="1920" height="1080" fill="url(#p-grid)" />
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
      <Node icon={CloudRain} title="Kairos dashboard" sub="plugin for Orbit, with NWS weather" rise="[--d:0.6s]" ping="[--d:3.3s]" className="top-[332px] left-[1152px]" />
      <Node icon={Route} title="Orbit" sub="pause or recall the round" rise="[--d:0.75s]" ping="[--d:4.4s]" className="top-[332px] left-[1612px]" />
      <Node icon={Database} title="Neon" sub="evidence log" rise="[--d:0.9s]" ping="[--d:4.4s]" className="top-[732px] left-[1152px]" />

      <Thumb className="k-hop [--d:1.3s] top-[352px] left-[455px] h-[96px] w-[150px]" />
      <Thumb className="k-hop [--d:2.35s] top-[352px] left-[915px] h-[96px] w-[150px]" />
      <Thumb className="k-hop [--d:3.45s] top-[352px] left-[1375px] h-[96px] w-[150px]" />
      <Thumb className="k-hop-down [--d:3.45s] top-[624px] left-[1160px] h-[76px] w-[120px]" />

      <Pill tone="info" pop="[--d:2.3s]" className="top-[262px] left-[760px]">water 64%</Pill>
      <Pill tone="hold" pop="[--d:3.35s]" className="top-[262px] left-[1220px]">HOLD at waypoint</Pill>
      <Pill tone="hold" pop="[--d:4.45s]" className="top-[262px] left-[1680px]">round paused</Pill>
      <Pill tone="go" pop="[--d:4.5s]" className="top-[776px] left-[1440px]">evidence logged</Pill>
    </>
  );
}

/* Beat 5 (StepSafe f028-f031): outro. */
function OutroBeat() {
  return (
    <div className="absolute inset-x-0 top-[230px] flex flex-col items-center text-center">
      <Mark className="k-pop [--d:0.1s] size-[150px] shadow-[0_0_80px_-10px_rgb(79_159_232/0.7)]" />
      <p className="k-rise [--d:0.3s] mt-8 text-[150px] leading-none font-bold tracking-tight">Kairos</p>
      <p className="k-rise [--d:0.6s] mt-8 text-[44px] text-white/80">Weather and water checks for Spot, inside Orbit</p>
      <p className="k-rise [--d:0.9s] mt-6 font-mono text-[36px] text-link">kairos.boston</p>
    </div>
  );
}

export type Beat = { ms: number; Scene: ComponentType; bg: string; brand: boolean };

const NAVY = "bg-[radial-gradient(ellipse_at_center,#14253b,#0b121c_70%)]";

// 30.5 s as authored; the player runs it 1.5x slower (intro.tsx), so 45.75 s on screen.
export const BEATS: Beat[] = [
  { ms: 8500, Scene: RouteBeat, bg: "bg-background", brand: true },
  { ms: 4000, Scene: RadarBeat, bg: "bg-[#0b1420]", brand: true },
  { ms: 8500, Scene: StormBeat, bg: "bg-background", brand: true },
  { ms: 6000, Scene: PipelineBeat, bg: NAVY, brand: true },
  { ms: 3500, Scene: OutroBeat, bg: NAVY, brand: false },
];
