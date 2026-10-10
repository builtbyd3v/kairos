import Link from "next/link";
import { Printer } from "lucide-react";
import { analyze, type Kit } from "@/lib/kit";
import type { Review } from "@/lib/reviews";
import { buildBrief, type BriefInput } from "@/lib/brief";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = { kit: Kit; reviews: Record<string, Review>; plan: BriefInput["plan"] };

export const briefOf = ({ kit, reviews, plan }: Props) => buildBrief({ analysis: analyze(kit), anomalies: kit.anomalies, reviews, plan });

/** Plain-English summary of the shift, for the operator handing over. */
export function ShiftBrief(props: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Shift brief</CardTitle>
        <CardAction>
          <Link href="/brief" className="inline-flex items-center gap-1 text-sm text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
            <Printer aria-hidden className="size-3.5" />
            Print handoff
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-1.5 pl-4 text-sm leading-snug marker:text-helper">
          {briefOf(props).map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
