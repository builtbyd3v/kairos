import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { listDetections, type EvidenceRow } from "@/lib/evidence";
import { waterLikelihood } from "@/lib/water-confidence";
import { EvidenceLabelButtons } from "@/components/evidence-label-buttons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** "Water on the route": the newest detections from Spot's camera, logged in Neon, each one an operator Confirm or Reject. */
export function RouteWater() {
  return (
    <Suspense fallback={<Card className="px-4 text-sm text-muted-foreground">Loading detections…</Card>}>
      <List />
    </Suspense>
  );
}

async function List() {
  const rows = (await listDetections(12)).filter((d) => !d.frame_uri.startsWith("/inspections/")).slice(0, 3);
  return (
    <Card className="animate-rise">
      <CardHeader>
        <CardTitle>Water on the route</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No water seen on recent rounds.</p>}
        {rows.map((d) => (
          <Row key={d.id} d={d} />
        ))}
        <Link href="/evidence" className="inline-flex items-center gap-1 text-sm text-link hover:underline">
          All evidence <ArrowRight aria-hidden className="size-4" />
        </Link>
      </CardContent>
    </Card>
  );
}

function Row({ d }: { d: EvidenceRow }) {
  const pct = waterLikelihood(d.score)?.pct;
  return (
    <div className="flex items-center gap-3 rounded-lg bg-black/30 p-2 ring-1 ring-white/[0.06]">
      {/* The overlay sits on the image's own box, so normalized coordinates map for any aspect ratio. */}
      <div className="relative w-24 shrink-0 overflow-hidden rounded">
        {/* eslint-disable-next-line @next/next/no-img-element -- stored frame URI */}
        <img src={d.frame_uri} alt={`Capture at ${d.waypoint ?? "unknown waypoint"}`} className="block h-auto w-full" />
        <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden className="absolute inset-0 size-full">
          <rect x={d.box_x} y={d.box_y} width={d.box_w} height={d.box_h} fill="#6ea8fe" fillOpacity="0.12" stroke="#8ab8ff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5 text-sm">
        <p>
          <span className="font-medium">{d.waypoint ?? "No waypoint"}</span>
          <span className="text-muted-foreground"> · water {pct !== undefined ? `${pct}% likely` : d.score.toFixed(2)}</span>
        </p>
        <p className={cn("text-xs", d.label === "confirm" ? "text-go" : d.label === "reject" ? "text-recall" : "text-hold")}>
          {d.label === "confirm" ? "Confirmed water" : d.label === "reject" ? "Rejected" : "Needs an operator"}
        </p>
        <EvidenceLabelButtons id={d.id} current={d.label} />
      </div>
    </div>
  );
}
