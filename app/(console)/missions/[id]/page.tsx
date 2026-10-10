import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleCheckBig, OctagonX } from "lucide-react";
import { analyze, loadKit } from "@/lib/kit";
import { DOCK, OUTDOOR_WAYPOINTS, routeOf } from "@/lib/route";
import { SEVERITY_UI, TRUTH_UI } from "@/components/status";
import { PageHeader } from "@/components/page-header";
import { FacilityMap } from "@/components/facility-map";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export async function generateStaticParams() {
  const kit = await loadKit();
  return kit.missions.map((m) => ({ id: m.id }));
}

export default async function MissionPage({ params }: PageProps<"/missions/[id]">) {
  const { id } = await params;
  const kit = await loadKit();
  const a = analyze(kit);
  const m = a.missionRows.find((x) => x.id === id);
  if (!m) notFound();

  const loc = new Map(kit.locations.map((l) => [l.id, l]));
  const asset = new Map(kit.assets.map((x) => [x.id, x]));
  const actions = kit.actions.filter((x) => x.missionId === id);
  const anomaliesByAction = new Map(kit.anomalies.filter((x) => x.missionId === id).map((x) => [x.actionId, x]));
  const readingByAction = new Map(kit.readings.map((r) => [r.actionId, r]));
  const route = routeOf(kit, id);
  const lowest = actions.reduce((lo, x) => (x.battery < lo.battery ? x : lo), actions[0]);
  const failedTypes = [...new Set(actions.filter((x) => !x.ok).map((x) => x.failureType.replaceAll("_", " ").toLowerCase()))];

  // Plain-language summary: what the operator should take away, in the brief's words.
  const summary = [
    m.failed > 0 &&
      (m.status === "COMPLETED"
        ? `Reported COMPLETED, but ${m.failed} of ${m.actions} inspections failed (${failedTypes.join(", ")}).`
        : `${m.failed} of ${m.actions} inspections failed (${failedTypes.join(", ")}).`),
    m.serious > 0 && `${m.serious} serious anomal${m.serious === 1 ? "y needs" : "ies need"} review.`,
    lowest && lowest.battery < 20 && `Battery reached ${lowest.battery}% at ${lowest.locationId}. Across the kit, inspections below 20% battery succeed 27% of the time.`,
    m.failed === 0 && m.serious === 0 && "Every inspection succeeded and no serious anomalies were found.",
  ].filter(Boolean) as string[];

  return (
    <main>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Link href="/missions" aria-label="Back to missions" className="text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
              <ArrowLeft aria-hidden className="size-5" />
            </Link>
            {m.id} · {m.name}
          </span>
        }
        subtitle={`${m.start.replace("T", " ").slice(0, 16)} kit time · ${m.durationMin} min · config ${m.config} · battery ${m.startBattery}% → ${m.endBattery}%`}
      />
      <div className="grid grid-cols-12 gap-5 px-8 py-6">
        <Card className="col-span-7">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              What happened
              <span className="text-sm font-normal text-muted-foreground">
                Reported {m.status} · actually <span className={cn("font-medium", TRUTH_UI[m.truth].text)}>{TRUTH_UI[m.truth].label}</span>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {summary.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="col-span-5">
          <CardHeader>
            <CardTitle>Route</CardTitle>
            <CardDescription>Blue line = this mission&apos;s path in action order</CardDescription>
          </CardHeader>
          <CardContent>
            <FacilityMap sites={a.sites} route={route} outdoor={[...OUTDOOR_WAYPOINTS]} dock={DOCK} />
          </CardContent>
        </Card>

        <Card className="col-span-12">
          <CardHeader>
            <CardTitle>Action timeline</CardTitle>
            <CardDescription>Every inspection Spot attempted, with its reading and any anomaly</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Where</TableHead>
                  <TableHead>Inspection</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Reading</TableHead>
                  <TableHead>Anomaly</TableHead>
                  <TableHead className="text-right">Battery</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {actions.map((x, i) => {
                  const r = readingByAction.get(x.id);
                  const an = anomaliesByAction.get(x.id);
                  return (
                    <TableRow key={x.id}>
                      <TableCell className="font-mono text-xs text-helper">{i + 1}</TableCell>
                      <TableCell className="font-mono text-xs">{x.timestamp.slice(11, 16)}</TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-helper">{x.locationId}</span> {loc.get(x.locationId)?.name}
                        <span className="block text-xs text-muted-foreground">{asset.get(x.assetId)?.name}</span>
                      </TableCell>
                      <TableCell className="capitalize">{x.type.replace("_INSPECTION", "").replace("_", " ").toLowerCase()}</TableCell>
                      <TableCell>
                        {x.ok ? (
                          <span className="inline-flex items-center gap-1 text-go">
                            <CircleCheckBig aria-hidden className="size-3.5" /> OK
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-recall">
                            <OctagonX aria-hidden className="size-3.5" /> {x.failureType.replaceAll("_", " ").toLowerCase()}
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
                            {an.severity} {an.type.replaceAll("_", " ").toLowerCase()}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className={cn("text-right font-mono", x.battery < 20 && "text-recall")}>{x.battery}%</TableCell>
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
