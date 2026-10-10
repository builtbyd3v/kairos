import { cn } from "@/lib/utils";

/**
 * Tiny bar sparkline for KPI cards. Values are drawn relative to the largest one.
 * Neutral bars, the latest bar in the accent, highlighted bars in recall red. Bars grow in with the parent's --rise-delay.
 */
export function SparkBars({ values, highlight, label, className }: { values: number[]; highlight?: (v: number, i: number) => boolean; label: string; className?: string }) {
  const max = Math.max(1, ...values);
  const w = 3;
  const gap = 3;
  return (
    <svg viewBox={`0 0 ${values.length * (w + gap)} 28`} className={cn("h-7 w-auto", className)} role="img" aria-label={label}>
      {values.map((v, i) => {
        const h = Math.max(2, (v / max) * 28);
        return <rect key={i} x={i * (w + gap)} y={28 - h} width={w} height={h} rx="1.5" className={cn("animate-grow-y", highlight?.(v, i) ? "fill-recall" : i === values.length - 1 ? "fill-primary" : "fill-white/25")} />;
      })}
    </svg>
  );
}
