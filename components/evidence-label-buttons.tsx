"use client";

import { useTransition } from "react";
import { Check, X } from "lucide-react";
import { labelDetection, type Label } from "@/lib/evidence";
import { Button } from "@/components/ui/button";

/** Confirm / Reject for one detection. Client only for the pending state; the write is the labelDetection server action. */
export function EvidenceLabelButtons({ id, current }: { id: number; current: Label | null }) {
  const [pending, start] = useTransition();
  const send = (label: Label) =>
    start(async () => {
      const form = new FormData();
      form.set("detectionId", String(id));
      form.set("label", label);
      await labelDetection(form);
    });
  return (
    <div className="flex gap-1.5" aria-busy={pending}>
      <Button size="sm" variant="outline" disabled={pending || current === "confirm"} onClick={() => send("confirm")} aria-label={`Confirm water in detection ${id}`}>
        <Check aria-hidden className="text-go" /> Confirm
      </Button>
      <Button size="sm" variant="outline" disabled={pending || current === "reject"} onClick={() => send("reject")} aria-label={`Reject detection ${id} as a false alarm`}>
        <X aria-hidden className="text-recall" /> Reject
      </Button>
    </div>
  );
}
