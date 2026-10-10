import type { Metadata } from "next";
import { Suspense } from "react";
import { Intro } from "@/components/intro/intro";

export const metadata: Metadata = { title: "Kairos intro" };

// Intro for the demo video, with player controls (they hide after 2 s without mouse movement).
// ?beat=1..5 starts at that beat. ?t=<seconds> freezes the clock there, no controls (video render).
export default function IntroPage({ searchParams }: PageProps<"/intro">) {
  return (
    <Suspense>
      <Player searchParams={searchParams} />
    </Suspense>
  );
}

async function Player({ searchParams }: Pick<PageProps<"/intro">, "searchParams">) {
  const { beat, t } = await searchParams;
  const n = Number(beat);
  const sec = typeof t === "string" && t !== "" ? Number(t) : NaN;
  return (
    <Intro
      beat={Number.isInteger(n) && n >= 1 && n <= 5 ? n - 1 : undefined}
      t={Number.isFinite(sec) && sec >= 0 ? sec : undefined}
    />
  );
}
