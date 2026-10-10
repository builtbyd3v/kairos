import { FloorCheck } from "@/components/floor-check";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Numbers from docs/model/RESULTS.md (held-out test set, never used for training or model selection).
const METRICS = [
  { model: "Always \"dry\"", acc: "56.9%", wet: "0%" },
  { model: "CLIP zero-shot (baseline)", acc: "71.8%", wet: "72.2%" },
  { model: "Our fine-tuned ConvNeXt-Tiny", acc: "99.6%", wet: "99.1%" },
];

export default function FloorCheckPage() {
  return (
    <main>
      <PageHeader
        title="Floor check"
        subtitle="A forecast can't see the floor Spot walks on. Our fine-tuned open model flags standing water in a camera frame so the dispatcher can hold that waypoint. It runs in this browser with transformers.js."
      />
      <div className="grid grid-cols-12 gap-5 px-8 py-6">
        <Card className="col-span-8 animate-rise">
          <CardHeader>
            <CardTitle>Try it</CardTitle>
            <CardDescription>Three held-out test images, three NextEra kit images, or your own</CardDescription>
          </CardHeader>
          <CardContent>
            <FloorCheck />
          </CardContent>
        </Card>
        <Card className="col-span-4 animate-rise [--rise-delay:60ms]">
          <CardHeader>
            <CardTitle>How good is it?</CardTitle>
            <CardDescription>752 held-out images (324 wet), 95% CIs in the model card. The browser loads a 34 MB int8 version (99.5% accuracy).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <table className="w-full text-left">
              <thead className="font-mono text-[11px] tracking-wider text-helper uppercase">
                <tr>
                  <th className="py-1 font-medium">Model</th>
                  <th className="font-medium">Accuracy</th>
                  <th className="font-medium">Wet recall</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {METRICS.map((m) => (
                  <tr key={m.model} className="border-t border-border/70">
                    <td className="py-2.5 font-sans">{m.model}</td>
                    <td>{m.acc}</td>
                    <td>{m.wet}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              <span className="font-medium">Honest number: 92.7% wet recall</span> on images from a single source (41 wet, 2 scenes). The full score is partly
              inflated because dry and wet images mostly come from different datasets.
            </p>
            <p className="text-muted-foreground">
              Off-domain: in our Python evaluation it flagged 2 of 6 dry NextEra kit images as wet (gauge p=0.51, thermal p=0.63). In the browser the gauge
              lands just under 0.5 because image resizing differs slightly; the thermal image is still a false alarm. Trained on public street scenes, not plant
              floors. Next step: fine-tune on real Spot frames.
            </p>
            <p className="text-xs text-helper">
              Model:{" "}
              <a className="text-link underline-offset-4 hover:underline" href="https://huggingface.co/builtbyd3v/spot-wetfloor-convnext-tiny">
                builtbyd3v/spot-wetfloor-convnext-tiny
              </a>
              . Data: Mendeley water/wet-surface images (CC BY 4.0) and a CC0 Kaggle public-spaces set. Base model facebook/convnext-tiny-224 (Apache-2.0).
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
