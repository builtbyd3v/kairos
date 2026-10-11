import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, CircleCheckBig, Droplets, TriangleAlert } from "lucide-react";
import { listDetections } from "@/lib/evidence";
import { loadKit } from "@/lib/kit";
import { waterLikelihood } from "@/lib/water-confidence";
import { EvidenceLabelButtons } from "@/components/evidence-label-buttons";
import { cn } from "@/lib/utils";
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
  const [all, kit] = await Promise.all([listDetections(20), loadKit()]);
  const rows = all.filter((d) => !d.frame_uri.startsWith("/inspections/"));
  const names = new Map(kit.locations.map((l) => [l.id, l.name]));
  const waiting = rows.filter((d) => d.label === null);
  const d = waiting[0] ?? rows[0];
  const pct = d ? waterLikelihood(d.score)?.pct : undefined;
  const hazards = rows.filter((r) => r.label === "confirm");
  const where = (r: { waypoint: string | null }) => (r.waypoint ? `${r.waypoint} ${names.get(r.waypoint) ?? ""}`.trim() : "the route");
  // One tile per photo: repeated live-round runs store the same demo frame again.
  const recent = rows.filter((r, i) => r.frame_uri !== d?.frame_uri && rows.findIndex((x) => x.frame_uri === r.frame_uri) === i).slice(0, 4);
  const state = waiting.length
    ? { Icon: TriangleAlert, title: "Needs an operator", caption: `Water seen at ${where(waiting[0])}: Spot holds there until someone confirms or rejects it`, text: "text-hold", ring: "bg-hold/10 ring-hold/40" }
    : hazards.length
      ? { Icon: Droplets, title: `Hazard marked at ${where(hazards[0])}`, caption: "Confirmed water: Spot routes around it on the next rounds", text: "text-[#8ab8ff]", ring: "bg-[#6ea8fe]/10 ring-[#6ea8fe]/40" }
      : { Icon: CircleCheckBig, title: "Route dry", caption: "No water seen on recent rounds", text: "text-go", ring: "bg-go/10 ring-go/40" };
  return (
    <Card className="animate-rise [--rise-delay:60ms]">
      <CardHeader>
        <CardTitle>Water on the route</CardTitle>
      </CardHeader>
      {/* Wide screens: the state and the answer on the left, the camera frame on the right. */}
      <CardContent className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {/* The state says what the water IS: unanswered, a marked hazard, or none. Never "GO" next to a picture of water. */}
          <div className={cn("rounded-xl px-5 py-4 ring-1", state.ring)}>
            <p className={cn("flex items-center gap-2 text-2xl font-semibold tracking-tight", state.text)}>
              <state.Icon aria-hidden className="size-6" />
              {state.title}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{state.caption}</p>
          </div>
          {d && (
            <p className="text-sm">
              {where(d)}: water {pct !== undefined ? `${pct}% likely` : `score ${d.score.toFixed(2)}`}
              <span className="text-muted-foreground"> · {d.label === "confirm" ? "confirmed" : d.label === "reject" ? "rejected" : "needs an answer"}</span>
            </p>
          )}
          {d && <EvidenceLabelButtons id={d.id} current={d.label} />}
          <Link href="/evidence" className="inline-flex items-center gap-1 text-sm text-link hover:underline">
            All water evidence <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
        {/* The overlay sits on the image's own box, so normalized coordinates map for any aspect ratio. */}
        {d && (
          <div className="relative mx-auto w-fit overflow-hidden rounded-lg ring-1 ring-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- stored frame URI */}
            <img src={d.frame_uri} alt={`Spot camera at ${d.waypoint ?? "the route"}`} className="block h-auto max-h-56 w-auto" />
            <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden className="absolute inset-0 size-full">
              <rect x={d.box_x} y={d.box_y} width={d.box_w} height={d.box_h} fill="#6ea8fe" fillOpacity="0.1" stroke="#8ab8ff" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        )}
        {recent.length > 0 && (
          <div className="space-y-2 md:col-span-2">
            <p className="label-caps text-helper">Recent catches by the water model</p>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {recent.map((r) => (
                <li key={r.id} className="space-y-1">
                  <div className="relative overflow-hidden rounded-lg ring-1 ring-border">
                    {/* eslint-disable-next-line @next/next/no-img-element -- stored frame URI */}
                    <img src={r.frame_uri} alt={`Spot camera at ${where(r)}`} className="block aspect-[4/3] w-full object-cover" />
                  </div>
                  <p className="truncate text-xs font-medium">{r.waypoint ? where(r) : r.source === "seed" ? "Held-out test photo" : "Route"}</p>
                  <p className="text-xs text-muted-foreground">
                    {waterLikelihood(r.score)?.pct ?? Math.round(r.score * 100)}% · {r.label === "confirm" ? "confirmed" : r.label === "reject" ? "rejected" : "waiting"}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
