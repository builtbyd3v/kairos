import Link from "next/link";
import { notFound } from "next/navigation";
import { cacheLife } from "next/cache";
import { neon } from "@neondatabase/serverless";
import { ArrowLeft, CircleCheckBig, OctagonX } from "lucide-react";
import { analyze, loadKit, pct } from "@/lib/kit";
import { DOCK, OUTDOOR_WAYPOINTS } from "@/lib/route";
import { SEVERITY_UI } from "@/components/status";
import { PageHeader } from "@/components/page-header";
import { FacilityMap } from "@/components/facility-map";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const label = (s: string) => s.replaceAll("_", " ").toLowerCase();
const toneText = (p: number) => (p >= 85 ? "text-go" : p >= 70 ? "text-hold" : "text-recall");
const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

// note: loadKit() drops assets.location_id and asset_type, so read them here. Fold into loadKit if a second page needs them.
async function assetHomes() {
  "use cache";
  cacheLife("hours");
  const sql = neon(process.env.DATABASE_URL ?? "");
  const rows = await sql`SELECT asset_id, asset_type, location_id FROM assets`;
  return new Map(rows.map((r) => [String(r.asset_id), { type: String(r.asset_type), locationId: String(r.location_id) }]));
}

function counts(xs: string[]) {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
}

export async function generateStaticParams() {
  const kit = await loadKit();
  return kit.locations.map((l) => ({ id: l.id }));
}

export default async function WaypointPage({ params }: PageProps<"/waypoints/[id]">) {
  const { id } = await params;
  const [kit, homes] = await Promise.all([loadKit(), assetHomes()]);
  const a = analyze(kit);
  const site = a.sites.find((s) => s.id === id);
  if (!site) notFound();

  const asset = new Map(kit.assets.map((x) => [x.id, x]));
  const actions = kit.actions.filter((x) => x.locationId === id);
  const anomalies = kit.anomalies.filter((x) => x.locationId === id);
  const anomalyByAction = new Map(anomalies.map((x) => [x.actionId, x]));
  const readingByAction = new Map(kit.readings.map((r) => [r.actionId, r]));
  const p = pct(site.ok, site.total);
  const failures = counts(actions.filter((x) => !x.ok).map((x) => x.failureType));
  const configs = ["V1", "V2"].map((c) => {
    const xs = actions.filter((x) => x.config === c);
    return { c, ok: xs.filter((x) => x.ok).length, total: xs.length };
  });
  const registered = kit.assets.filter((x) => homes.get(x.id)?.locationId === id);
  const inspected = [...new Set(actions.map((x) => x.assetId))];
  const elsewhere = actions.filter((x) => homes.get(x.assetId)?.locationId !== id).length;

  return (
    <main>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Link href="/waypoints" aria-label="Back to waypoints" className="text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
              <ArrowLeft aria-hidden className="size-5" />
            </Link>
            {site.id} · {site.name}
          </span>
        }
        subtitle={
          <span className="capitalize">
            {label(site.zone)} zone · floor {site.floor} · {label(site.environment)}
            {OUTDOOR_WAYPOINTS.has(id) && <span className="normal-case"> · Assumed outdoor leg (entrance apron)</span>}
            {id === DOCK && <span className="normal-case"> · Assumed dock</span>}
          </span>
        }
      />
      <div className="grid grid-cols-12 gap-5 px-8 py-6">
        <Card className="col-span-3">
          <CardHeader>
            <CardDescription className="text-[11px] tracking-wider text-helper uppercase">Inspections OK</CardDescription>
            <CardTitle className={cn("font-mono text-3xl tabular-nums", toneText(p))}>{p}%</CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-sm text-muted-foreground tabular-nums">
            {site.ok} of {site.total} actions
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardDescription className="text-[11px] tracking-wider text-helper uppercase">Failures by type</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {failures.length === 0 && <p className="text-muted-foreground">No failures here.</p>}
            {failures.map(([f, n]) => (
              <div key={f} className="flex justify-between capitalize">
                <span>{label(f)}</span>
                <span className="font-mono tabular-nums">{n}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardDescription className="text-[11px] tracking-wider text-helper uppercase">Anomalies by severity</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {anomalies.length === 0 && <p className="text-muted-foreground">No anomalies here.</p>}
            {SEVERITIES.map((s) => {
              const n = anomalies.filter((x) => x.severity === s).length;
              return (
                n > 0 && (
                  <div key={s} className="flex items-center justify-between">
                    <span className={cn("rounded px-1.5 py-0.5 text-xs ring-1", SEVERITY_UI[s])}>{s}</span>
                    <span className="font-mono tabular-nums">{n}</span>
                  </div>
                )
              );
            })}
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardDescription className="text-[11px] tracking-wider text-helper uppercase">Success by config here</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {configs.map(({ c, ok, total }) => (
              <div key={c} className="flex justify-between">
                <span>{c}</span>
                <span className="font-mono tabular-nums">
                  {total ? <span className={toneText(pct(ok, total))}>{pct(ok, total)}%</span> : <span className="text-helper">no runs</span>}
                  <span className="text-muted-foreground">
                    {" "}
                    ({ok}/{total})
                  </span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="col-span-5">
          <CardHeader>
            <CardTitle>Where it is</CardTitle>
            <CardDescription>{site.id} marked on the two-floor map</CardDescription>
          </CardHeader>
          <CardContent>
            <FacilityMap sites={a.sites} route={[id]} spot={id} outdoor={[...OUTDOOR_WAYPOINTS]} dock={DOCK} />
          </CardContent>
        </Card>

        <Card className="col-span-7">
          <CardHeader>
            <CardTitle>Assets</CardTitle>
            <CardDescription>
              {elsewhere > 0
                ? `${elsewhere} of ${actions.length} actions here reference assets registered elsewhere in assets.csv. The kit's asset and action locations do not always agree.`
                : "Every action here references an asset registered at this waypoint."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-6 text-sm">
            <div>
              <h2 className="mb-2 text-[11px] tracking-wider text-helper uppercase">Registered here (assets.csv)</h2>
              {registered.length === 0 && <p className="text-muted-foreground">None.</p>}
              <ul className="space-y-1">
                {registered.map((x) => (
                  <li key={x.id}>
                    <span className="font-mono text-xs text-helper">{x.id}</span> {x.name} <span className="text-xs text-muted-foreground lowercase">{x.criticality}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="mb-2 text-[11px] tracking-wider text-helper uppercase">Inspected here (actions.csv)</h2>
              <ul className="space-y-1">
                {inspected.map((aid) => (
                  <li key={aid}>
                    <span className="font-mono text-xs text-helper">{aid}</span> {asset.get(aid)?.name ?? aid}
                    {homes.get(aid)?.locationId !== id && <span className="text-xs text-hold"> registered at {homes.get(aid)?.locationId ?? "unknown"}</span>}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-12">
          <CardHeader>
            <CardTitle>Every action at {site.id}</CardTitle>
            <CardDescription>{actions.length} actions across all missions, in kit time order</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mission</TableHead>
                  <TableHead>Kit time</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Inspection</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Reading</TableHead>
                  <TableHead>Anomaly</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {actions.map((x) => {
                  const r = readingByAction.get(x.id);
                  const an = anomalyByAction.get(x.id);
                  return (
                    <TableRow key={x.id}>
                      <TableCell>
                        <Link href={`/missions/${x.missionId}`} className="font-mono text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                          {x.missionId}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{x.timestamp.replace("T", " ").slice(5, 16)}</TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-helper">{x.assetId}</span> {asset.get(x.assetId)?.name}
                      </TableCell>
                      <TableCell className="capitalize">{label(x.type.replace("_INSPECTION", ""))}</TableCell>
                      <TableCell>
                        {x.ok ? (
                          <span className="inline-flex items-center gap-1 text-go">
                            <CircleCheckBig aria-hidden className="size-3.5" /> OK
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-recall">
                            <OctagonX aria-hidden className="size-3.5" /> {label(x.failureType)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r ? (
                          <>
                            {r.value} {r.unit}
                            {r.quality !== "GOOD" && <span className="block text-hold">{r.quality.toLowerCase()}</span>}
                          </>
                        ) : (
                          <span className="text-helper">none</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {an && (
                          <span className={cn("rounded px-1.5 py-0.5 text-xs ring-1", SEVERITY_UI[an.severity])}>
                            {an.severity} {label(an.type)}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
