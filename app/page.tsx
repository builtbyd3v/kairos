import { Suspense } from "react";
import { connection } from "next/server";
import { analyze, loadKit, pct, type Kit } from "@/lib/kit";
import { decide, ORBIT_CALL, type Reason, type Verdict } from "@/lib/verdict";
import { getLiveWeather, SITE } from "@/lib/weather";
import { logDecision, recentDecisions } from "@/lib/decisions";

// Status is always color + icon + word, never color alone.
const VERDICT_STYLE: Record<Verdict, { icon: string; className: string; label: string }> = {
  GO: { icon: "✓", className: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/40", label: "GO" },
  HOLD: { icon: "⏸", className: "bg-amber-500/15 text-amber-200 ring-amber-400/40", label: "HOLD" },
  RECALL: { icon: "⚠", className: "bg-red-500/15 text-red-200 ring-red-400/50", label: "RECALL" },
};

const TRUTH_STYLE: Record<string, string> = {
  CLEAN: "text-emerald-300",
  DEGRADED: "text-amber-200",
  "NEEDS REVIEW": "text-red-200",
  FAILED: "text-red-300",
};

const SEVERITY_STYLE: Record<string, string> = {
  CRITICAL: "bg-red-500/20 text-red-200",
  HIGH: "bg-orange-500/20 text-orange-200",
  MEDIUM: "bg-amber-500/15 text-amber-200",
  LOW: "bg-slate-500/20 text-slate-300",
};

const fmtTime = (iso: string) => iso.replace("T", " ").slice(5, 16);

export default async function Page() {
  const kit = await loadKit();
  const a = analyze(kit);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-[#0b1530]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-baseline justify-between gap-2 px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight">
            SPOT Dispatch <span className="font-normal text-slate-400">· readiness board</span>
          </h1>
          <p className="text-xs text-slate-400">
            NextEra synthetic kit · {a.totals.missions} Autowalk missions · {a.totals.range[0]?.slice(0, 10)} to {a.totals.range[1]?.slice(0, 10)}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <Suspense fallback={<Panel title="Next round">Checking weather…</Panel>}>
          <NextRound kit={kit} />
        </Suspense>

        <section aria-label="What the mission status hides" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Missions reported COMPLETED" value={`${a.totals.reportedCompleted} / ${a.totals.missions}`} note="What the robot says" />
          <Stat label="Missions actually clean" value={`${a.totals.clean} / ${a.totals.missions}`} note="No failed inspections, no serious anomalies" tone="warn" />
          <Stat label="Failed inspections hidden in COMPLETED missions" value={String(a.totals.hiddenFailures)} note="Mission status alone shows none of these" tone="bad" />
          <Stat label="Serious anomalies inside COMPLETED missions" value={`${a.totals.seriousHidden} / ${a.totals.serious}`} note="HIGH or CRITICAL severity" tone="bad" />
        </section>

        <div className="grid gap-6 lg:grid-cols-5">
          <Panel title="Attention queue" subtitle="Ranked by anomaly severity, then asset criticality" className="lg:col-span-3">
            <ol className="divide-y divide-slate-800">
              {a.queue.slice(0, 8).map((q, i) => (
                <li key={q.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                  <span className="w-5 text-right text-slate-500">{i + 1}</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${SEVERITY_STYLE[q.severity]}`}>{q.severity}</span>
                  <span className="font-medium">{q.type.replaceAll("_", " ").toLowerCase()}</span>
                  <span className="text-slate-400">
                    {q.assetName} ({q.criticality.toLowerCase()} criticality) · {q.locationName}
                  </span>
                  <span className="ml-auto text-xs text-slate-500">
                    {q.missionId} · {fmtTime(q.timestamp)}
                    {q.hidden && <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-amber-200">hidden in COMPLETED</span>}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title="Facility map" subtitle="Inspection success rate by waypoint" className="lg:col-span-2">
            <FacilityMap sites={a.sites} />
          </Panel>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Battery vs. inspection success" subtitle="V2 never ran below 40%, so part of its raw lead is battery, not configuration">
            <div className="space-y-2 text-sm">
              {a.bands.map((b) => (
                <div key={b.band} className="grid grid-cols-[4.5rem_1fr] items-center gap-2">
                  <span className="text-slate-400">{b.band}</span>
                  <div className="space-y-1">
                    <Bar label="V1" ok={b.v1.ok} total={b.v1.total} />
                    <Bar label="V2" ok={b.v2.ok} total={b.v2.total} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Least reliable inspections" subtitle="Share of actions that succeeded, all missions">
            <div className="space-y-2 text-sm">
              {a.byType.map((t) => (
                <Bar key={t.type} label={t.type.replace("_INSPECTION", "").replace("_", " ").toLowerCase()} ok={t.ok} total={t.total} wide />
              ))}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {a.configs.map((c) => (
                <div key={c.config} className="rounded-lg bg-slate-900 p-3">
                  <dt className="font-medium">{c.config}</dt>
                  <dd className="text-slate-400">
                    {pct(c.ok, c.total)}% actions OK · {c.avgDuration} min · {c.avgDrain}% battery per mission
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>

        <Panel title="Missions" subtitle="Reported status next to what actually happened inside each mission">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-400">
                <tr>
                  <th className="py-2 pr-3 font-medium">Mission</th>
                  <th className="pr-3 font-medium">Start</th>
                  <th className="pr-3 font-medium">Config</th>
                  <th className="pr-3 font-medium">Reported</th>
                  <th className="pr-3 font-medium">Actually</th>
                  <th className="pr-3 font-medium">Failed actions</th>
                  <th className="pr-3 font-medium">Anomalies</th>
                  <th className="font-medium">Battery</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {[...a.missionRows].reverse().map((m) => (
                  <tr key={m.id}>
                    <td className="py-1.5 pr-3 font-mono text-xs">{m.id}</td>
                    <td className="pr-3 text-slate-400">{fmtTime(m.start)}</td>
                    <td className="pr-3">{m.config}</td>
                    <td className="pr-3">{m.status}</td>
                    <td className={`pr-3 font-medium ${TRUTH_STYLE[m.truth]}`}>{m.truth}</td>
                    <td className="pr-3">
                      {m.failed} / {m.actions}
                    </td>
                    <td className="pr-3">
                      {m.anomalies}
                      {m.serious > 0 && <span className="text-red-300"> ({m.serious} serious)</span>}
                    </td>
                    <td className="text-slate-400">
                      {m.startBattery}% → {m.endBattery}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Suspense fallback={<Panel title="Decision log">Loading…</Panel>}>
          <DecisionLog />
        </Suspense>

        <footer className="space-y-1 pb-8 text-xs text-slate-500">
          <p>Mission data is NextEra&apos;s synthetic challenge kit. It has no weather and an indoor facility.</p>
          <p>
            Assumptions: the site is {SITE.name}, each round has an outdoor leg at the WP01 entrance, and rain, thunder and wind thresholds marked
            &quot;our assumption&quot; are placeholders until NextEra shares its procedure limits. Orbit calls are simulated.
          </p>
        </footer>
      </main>
    </div>
  );
}

// Rounds launch at 02:00, 10:00 and 18:00 plant time, as in the kit's mission schedule.
function nextRoundStart(now: Date): Date {
  const wall = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const offset = now.getTime() - wall.getTime();
  for (let day = 0; day < 2; day++) {
    for (const hour of [2, 10, 18]) {
      const c = new Date(wall);
      c.setDate(c.getDate() + day);
      c.setHours(hour, 0, 0, 0);
      if (c > wall) return new Date(c.getTime() + offset);
    }
  }
  throw new Error("unreachable");
}

async function NextRound({ kit }: { kit: Kit }) {
  await connection();
  const now = new Date();
  const weather = await getLiveWeather();
  const a = analyze(kit);

  const last = kit.missions.at(-1)!;
  const v2 = a.configs.find((c) => c.config === last.config)!;
  const start = nextRoundStart(now);
  const end = new Date(start.getTime() + v2.avgDuration * 60000);
  const route = new Set(kit.actions.filter((x) => x.missionId === last.id).map((x) => x.locationId));
  const routeRisk = a.sites
    .filter((s) => route.has(s.id))
    .map((s) => ({ locationId: s.id, name: s.name, successPct: pct(s.ok, s.total) }))
    .sort((x, y) => x.successPct - y.successPct)
    .slice(0, 2);

  // note: battery at launch assumed equal to the last mission's start battery; no live telemetry in the kit.
  const { verdict, reasons } = decide(weather, { batteryPct: last.startBattery, routeRisk }, { now, start, end }, false);
  const style = VERDICT_STYLE[verdict];
  const startLabel = start.toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" });

  return (
    <Panel title="Next round" subtitle={`${last.name.replace(/\d+$/, "").trim()} · launches ${startLabel} ET · back on dock about ${v2.avgDuration} min later`}>
      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-start gap-3">
          <div className={`rounded-xl px-6 py-4 text-4xl font-bold ring-1 ${style.className}`} role="status">
            <span aria-hidden>{style.icon}</span> {style.label}
          </div>
          <form action={logDecision} className="flex gap-2">
            <input type="hidden" name="verdict" value={verdict} />
            <input type="hidden" name="source" value="live" />
            <input type="hidden" name="reasons" value={JSON.stringify(reasons)} />
            <button name="action" value="confirmed" className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400">
              Confirm {verdict}
            </button>
            {verdict !== "GO" && (
              <button name="action" value="overridden" className="rounded-md px-3 py-1.5 text-sm text-slate-300 ring-1 ring-slate-600 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-sky-400">
                Override, launch anyway
              </button>
            )}
          </form>
          {ORBIT_CALL[verdict] && <p className="max-w-xs text-xs text-slate-500">On confirm: {ORBIT_CALL[verdict]} (simulated)</p>}
        </div>

        <div className="space-y-4">
          <ReasonList reasons={reasons} />
          <WeatherStrip weather={weather} />
        </div>
      </div>
    </Panel>
  );
}

function ReasonList({ reasons }: { reasons: Reason[] }) {
  if (reasons.length === 0) return <p className="text-sm text-slate-300">No weather or health limits are close for this round.</p>;
  return (
    <ul className="space-y-2">
      {reasons.map((r) => (
        <li key={r.text} className="flex gap-2 text-sm">
          <span className={`mt-0.5 shrink-0 rounded px-1.5 text-xs font-medium ring-1 ${VERDICT_STYLE[r.verdict].className}`}>{r.verdict}</span>
          <span>
            {r.text} <span className="text-xs text-slate-500">· {r.source}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function WeatherStrip({ weather }: { weather: Awaited<ReturnType<typeof getLiveWeather>> }) {
  if (!weather) return <p className="text-sm text-amber-200">⏸ Live weather is unavailable, so the board holds until it returns.</p>;
  const hourly = weather.steps.filter((s) => s.tempC !== null).slice(0, 12);
  return (
    <div>
      <p className="mb-2 text-xs text-slate-400">
        {SITE.name} · NWS + Open-Meteo · updated {new Date(weather.fetchedAt).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} ET
        {weather.alerts.length > 0 && <> · active: {weather.alerts.join(", ")}</>}
      </p>
      <div className="grid grid-cols-6 gap-1 text-center text-xs sm:grid-cols-12">
        {hourly.map((s) => (
          <div key={s.time} className="rounded bg-slate-900 px-1 py-2">
            <div className="text-slate-400">{new Date(s.time).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric" })}</div>
            <div className="font-medium">{s.tempC === null ? "-" : `${Math.round(s.tempC)}°C`}</div>
            <div className="text-slate-400" title="Chance of thunder">⚡{s.thunderPct ?? "-"}%</div>
            <div className="text-slate-400" title="Wind gust">{s.gustKmh === null ? "-" : `${Math.round(s.gustKmh)} km/h`}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

async function DecisionLog() {
  await connection();
  const rows = await recentDecisions();
  return (
    <Panel title="Decision log" subtitle="Every confirm or override is stored in Neon with the reasons the operator saw">
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">No decisions yet. Confirm the next round above.</p>
      ) : (
        <ul className="divide-y divide-slate-800 text-sm">
          {rows.map((d) => (
            <li key={d.id} className="flex flex-wrap gap-x-3 py-2">
              <span className="text-slate-500">{d.created_at.slice(5, 16)} UTC</span>
              <span className={`rounded px-1.5 text-xs font-medium ring-1 ${VERDICT_STYLE[d.verdict].className}`}>{d.verdict}</span>
              <span>{d.operator_action}</span>
              <span className="text-slate-400">{d.reasons[0]?.text ?? "No limits close"}</span>
              {d.orbit_call && <span className="text-xs text-slate-500">→ {d.orbit_call}</span>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function FacilityMap({ sites }: { sites: ReturnType<typeof analyze>["sites"] }) {
  const color = (p: number) => (p >= 85 ? "#34d399" : p >= 70 ? "#fbbf24" : "#f87171");
  return (
    <div className="grid grid-cols-2 gap-2">
      {[1, 2].map((floor) => (
        <figure key={floor}>
          <svg viewBox="-8 -8 116 116" className="w-full rounded-lg bg-[#0d1b3d]" role="img" aria-label={`Floor ${floor} waypoints`}>
            {sites
              .filter((s) => s.floor === floor)
              .map((s) => {
                const p = pct(s.ok, s.total);
                return (
                  <g key={s.id}>
                    <title>{`${s.id} ${s.name}: ${p}% success (${s.ok}/${s.total}), ${s.anomalies} anomalies`}</title>
                    <circle cx={s.x} cy={s.y} r={3 + s.anomalies} fill={color(p)} fillOpacity={0.25} stroke={color(p)} />
                    <text x={s.x} y={s.y + 1.5} textAnchor="middle" fontSize="4" fill="#e2e8f0">
                      {s.id.slice(2)}
                    </text>
                  </g>
                );
              })}
          </svg>
          <figcaption className="mt-1 text-center text-xs text-slate-400">Floor {floor}</figcaption>
        </figure>
      ))}
      <p className="col-span-2 text-xs text-slate-500">Circle size = anomaly count. Green ≥ 85%, amber ≥ 70%, red below. Hover for details.</p>
    </div>
  );
}

function Panel({ title, subtitle, className = "", children }: { title: string; subtitle?: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`rounded-xl border border-slate-800 bg-slate-900/50 p-4 ${className}`}>
      <h2 className="font-semibold">{title}</h2>
      {subtitle && <p className="mb-3 text-xs text-slate-400">{subtitle}</p>}
      {children}
    </section>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "warn" | "bad" }) {
  const border = tone === "bad" ? "border-b-red-400" : tone === "warn" ? "border-b-amber-300" : "border-b-sky-400";
  return (
    <div className={`rounded-xl border border-slate-800 border-b-4 bg-slate-900/50 p-4 ${border}`}>
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-sm">{label}</p>
      <p className="text-xs text-slate-500">{note}</p>
    </div>
  );
}

function Bar({ label, ok, total, wide }: { label: string; ok: number; total: number; wide?: boolean }) {
  const p = pct(ok, total);
  return (
    <div className={`grid items-center gap-2 ${wide ? "grid-cols-[6rem_1fr_6rem]" : "grid-cols-[2rem_1fr_6rem]"}`}>
      <span className="text-xs text-slate-400">{label}</span>
      <progress
        value={ok}
        max={total || 1}
        aria-label={`${label}: ${p}%`}
        className="h-2 w-full appearance-none overflow-hidden rounded [&::-moz-progress-bar]:bg-sky-400 [&::-webkit-progress-bar]:bg-slate-800 [&::-webkit-progress-value]:bg-sky-400"
      />
      <span className="text-xs text-slate-400">{total ? `${p}% (${ok}/${total})` : "no runs"}</span>
    </div>
  );
}
