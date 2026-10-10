import Link from "next/link";
import { analyze, loadKit } from "@/lib/kit";
import { isOutdoor, routeOf } from "@/lib/route";
import { TRUTH_UI } from "@/components/status";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TablePill, TableRow } from "@/components/ui/table";

const fmtTime = (iso: string) => iso.replace("T", " ").slice(5, 16);

export default async function MissionsPage() {
  const kit = await loadKit();
  const a = analyze(kit);
  const notClean = a.missionRows.filter((m) => m.truth !== "CLEAN").length;

  return (
    <main>
      <PageHeader
        title="Missions"
        subtitle={`${a.totals.missions} Autowalk rounds, ${a.totals.range[0]?.slice(0, 10)} to ${a.totals.range[1]?.slice(0, 10)} (kit time). ${notClean} of them need more than their reported status says.`}
      />
      <div className="px-8 py-6">
        <Card className="animate-rise">
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mission</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Config</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Reported</TableHead>
                  <TableHead>Actually</TableHead>
                  <TableHead className="text-right">Failed actions</TableHead>
                  <TableHead className="text-right">Anomalies</TableHead>
                  <TableHead className="text-right">Battery</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...a.missionRows].reverse().map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Link href={`/missions/${m.id}`} className="font-mono text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                        {m.id}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{fmtTime(m.start)}</TableCell>
                    <TableCell className="font-mono text-xs">{m.config}</TableCell>
                    <TableCell className="text-muted-foreground">{isOutdoor(routeOf(kit, m.id)) ? "Includes outdoor leg" : "Indoors"}</TableCell>
                    <TableCell>
                      <TablePill className={m.status === "COMPLETED" ? "text-muted-foreground" : "text-recall"}>{m.status}</TablePill>
                    </TableCell>
                    <TableCell>
                      <TablePill className={TRUTH_UI[m.truth].text}>{TRUTH_UI[m.truth].label}</TablePill>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {m.failed}/{m.actions}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {m.anomalies}
                      {m.serious > 0 && <span className="text-recall"> ({m.serious} serious)</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground tabular-nums">
                      {m.startBattery}% → {m.endBattery}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
