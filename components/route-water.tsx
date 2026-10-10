import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { listDetections } from "@/lib/evidence";
import { waterLikelihood } from "@/lib/water-confidence";
import { EvidenceLabelButtons } from "@/components/evidence-label-buttons";
import { VerdictBlock } from "@/components/status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Dashboard hero: water Spot's camera found on the route, newest first, waiting for an operator's Confirm or Reject. */
export function RouteWater() {
  return (
    <Suspense fallback={<Card className="min-h-96 animate-pulse" />}>
      <Water />
    </Suspense>
  );
}

async function Water() {
  // Route captures only: the kit's inspection close-ups are not floor views.
  const rows = (await listDetections(20)).filter((d) => !d.frame_uri.startsWith("/inspections/"));
  const waiting = rows.filter((d) => d.label === null);
  const d = waiting[0] ?? rows[0];
  const pct = d ? waterLikelihood(d.score)?.pct : undefined;
  return (
    <Card className="animate-rise [--rise-delay:60ms]">
      <CardHeader>
        <CardTitle>Water on the route</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <VerdictBlock
          verdict={waiting.length ? "HOLD" : "GO"}
          caption={waiting.length ? `${waiting.length} puddle${waiting.length > 1 ? "s" : ""} waiting for an operator` : "No water waiting on the route"}
        />
        {d && (
          <>
            <p className="text-sm">
              {d.waypoint ?? "Route"}: water {pct !== undefined ? `${pct}% likely` : `score ${d.score.toFixed(2)}`}
              <span className="text-muted-foreground"> · {d.label === "confirm" ? "confirmed" : d.label === "reject" ? "rejected" : "needs an answer"}</span>
            </p>
            {/* The overlay sits on the image's own box, so normalized coordinates map for any aspect ratio. */}
            <div className="relative overflow-hidden rounded-lg ring-1 ring-border">
              {/* eslint-disable-next-line @next/next/no-img-element -- stored frame URI */}
              <img src={d.frame_uri} alt={`Spot camera at ${d.waypoint ?? "the route"}`} className="block h-auto w-full" />
              <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden className="absolute inset-0 size-full">
                <rect x={d.box_x} y={d.box_y} width={d.box_w} height={d.box_h} fill="#6ea8fe" fillOpacity="0.1" stroke="#8ab8ff" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
            <EvidenceLabelButtons id={d.id} current={d.label} />
          </>
        )}
        <Link href="/evidence" className="inline-flex items-center gap-1 text-sm text-link hover:underline">
          All water evidence <ArrowRight aria-hidden className="size-4" />
        </Link>
      </CardContent>
    </Card>
  );
}
