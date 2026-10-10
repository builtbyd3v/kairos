import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SPOT Dispatch",
  description: "Readiness board for Boston Dynamics Spot inspection rounds: true mission status plus weather go / hold / recall.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
