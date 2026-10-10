import { cn } from "@/lib/utils";

/** Tiny bar sparkline for KPI cards. Values are drawn relative to the largest one. */
export function SparkBars({ values, highlight, label, className }: { values: number[]; highlight?: (v: number, i: number) => boolean; label: string; className?: string }) {
  const max = Math.max(1, ...values);
  const w = 4;
  const gap = 2.5;
  return (
    <svg viewBox={`0 0 ${values.length * (w + gap)} 28`} className={cn("h-7 w-auto", className)} role="img" aria-label={label}>
      {values.map((v, i) => {
        const h = Math.max(2, (v / max) * 28);
        return <rect key={i} x={i * (w + gap)} y={28 - h} width={w} height={h} rx="1.5" className={highlight?.(v, i) ? "fill-recall" : "fill-primary/70"} />;
      })}
    </svg>
  );
}
