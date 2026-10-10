import { cn } from "@/lib/utils";

// NextEra's kit ships one synthetic sample image per inspection class (04_ASSETS/sample_inspection_images).
const SAMPLE: Record<string, { src: string; alt: string }> = {
  NAVIGATION: { src: "pipe_gallery_01.jpg", alt: "Sample pipe gallery view" },
  THERMAL_INSPECTION: { src: "thermal_pump_bearing_01.jpg", alt: "Sample thermal image of a pump bearing" },
  ACOUSTIC_INSPECTION: { src: "acoustic_valve_01.jpg", alt: "Sample acoustic capture at a valve" },
  GAUGE_READING: { src: "gauge_pressure_01.jpg", alt: "Sample pressure gauge photo" },
  VISUAL_INSPECTION: { src: "visual_pump_motor_01.jpg", alt: "Sample visual photo of a pump motor" },
};
const VALVE = { src: "valve_detail_01.jpg", alt: "Sample visual photo of a valve" };

/** The kit's sample image for this inspection type. Not the actual capture: the kit has no per-action images. */
export function InspectionImage({ type, assetType, className }: { type: string; assetType?: string; className?: string }) {
  const img = type === "VISUAL_INSPECTION" && assetType?.toLowerCase().includes("valve") ? VALVE : SAMPLE[type];
  if (!img) return null;
  return (
    <figure className={cn("w-full max-w-60", className)}>
      {/* Plain img on purpose: the files are ~240x166 and already tiny, so the next/image optimizer adds nothing. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/inspections/${img.src}`} alt={img.alt} loading="lazy" className="h-auto w-full rounded-lg ring-1 ring-white/[0.06]" />
      <figcaption className="mt-1 text-[11px] text-helper">Sample image from NextEra&apos;s kit (synthetic), not this exact capture</figcaption>
    </figure>
  );
}
