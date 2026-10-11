import type { Metadata } from "next";
import "./globals.css";
import { Geist, Geist_Mono } from "next/font/google";
import { cn } from "@/lib/utils";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Kairos",
  description: "Catch the puddle. Clear the storm. A weather and water dashboard for Boston Dynamics Spot, built as an Orbit plugin. Built for NextEra's Spot.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn("font-sans antialiased", sans.variable, mono.variable)}>
      <body>{children}</body>
    </html>
  );
}
