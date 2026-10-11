import type { MetadataRoute } from "next";

// Add to Home Screen: Kairos opens full screen like an app. note: icon is the current SVG; swap in PNGs when the final logo lands.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kairos",
    short_name: "Kairos",
    description: "Catch the puddle. Clear the storm. Built for NextEra's Spot.",
    start_url: "/",
    display: "standalone",
    background_color: "#161616",
    theme_color: "#161616",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
