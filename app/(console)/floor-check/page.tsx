import { PageHeader } from "@/components/page-header";
import { WaterTry } from "@/components/water-try";
import { Why } from "@/components/why";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WATER_CONFIDENCE } from "@/lib/water-confidence";
import { WATER_MODEL_ID, WATER_REVISION } from "@/lib/water-model";
import { cn } from "@/lib/utils";

// Held-out test numbers from docs/model/water-v2/RESULTS.md (never trained on; threshold picked on a separate calibration split).
const STATS = [
  { value: "85%", label: "Wet photos caught", note: "461 of 543, from a source it never trained on", tone: "text-go" },
  { value: "2.3", label: "False alarms per 100 Spot frames", note: "4 of 172 dry frames from a camera on a Spot robot", tone: "text-go" },
  { value: "67 ms", label: "Per frame, in your browser", note: "WebGPU; no server, no upload", tone: "text-foreground" },
  { value: "7%", label: "Tiny puddles found", note: "4 of 57 under 1% of the frame. The known gap; your operators' labels close it", tone: "text-hold" },
];

const SAMPLES = [0, 1, 3, 5].map((i) => ({ src: `/captures/demo-wet-${i}.jpg`, label: `Held-out puddle photo ${i + 1}` })).concat([{ src: "/captures/demo-dry-0.jpg", label: "Dry floor, Spot camera" }]);

export default function WaterModelPage() {
  return (
    <main>
      <PageHeader title="Water model" subtitle="Finds puddles and spills in Spot's camera, right in the browser." />
      <div className="mx-auto grid max-w-[1440px] items-start gap-5 px-8 py-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="animate-rise">
          <CardHeader>
            <CardTitle>Try it</CardTitle>
          </CardHeader>
          <CardContent>
            <WaterTry samples={SAMPLES} />
          </CardContent>
        </Card>
        <div className="space-y-5">
          <Card className="animate-rise [--rise-delay:60ms]">
            <CardHeader>
              <CardTitle>How good is it</CardTitle>
            </CardHeader>
            <CardContent className="keep-grid grid grid-cols-2 gap-3">
              {STATS.map((s) => (
                <div key={s.label} className="panel-inset px-4 py-3">
                  <p className={cn("font-mono text-3xl font-medium tabular-nums", s.tone)}>{s.value}</p>
                  <p className="mt-1 text-sm">{s.label}</p>
                  <p className="mt-1 text-xs text-helper">{s.note}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="animate-rise [--rise-delay:120ms]">
            <CardHeader>
              <CardTitle>What the % means</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="keep-grid grid grid-cols-4 gap-2">
                {WATER_CONFIDENCE.map((b) => (
                  <div key={b.min} className="panel-inset px-3 py-2.5 text-center">
                    <p className="font-mono text-xl font-medium text-[#8ab8ff] tabular-nums">{b.pct}%</p>
                    <p className="text-[11px] text-helper">
                      score {b.min}-{b.max}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">Of the boxes the model drew at each score, this share was real water.</p>
              <Why>
                <p>Measured on a calibration split (315 boxes), checked on the held-out test split (680 boxes): docs/model/water-v2/CONFIDENCE.md.</p>
                <p>
                  Model:{" "}
                  <a className="text-link underline-offset-4 hover:underline" href={`https://huggingface.co/${WATER_MODEL_ID}/tree/${WATER_REVISION}`}>
                    {WATER_MODEL_ID}
                  </a>{" "}
                  @ {WATER_REVISION.slice(0, 7)}, fine-tuned from PekingU/rtdetr_v2_r18vd (Apache-2.0).
                </p>
                <p>
                  Data: Bhutad and Patil, Mendeley Data V4 (CC BY 4.0); Kaggle Dist-YOLO public spaces (CC0); Roboflow puddle and spill sets (CC BY 4.0); UT Austin SCAND Spot
                  footage (CC0). No NextEra frames: every number here is on public photos.
                </p>
              </Why>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
