import type { Metadata } from "next";
import { Suspense } from "react";
import { Intro } from "@/components/intro/intro";

export const metadata: Metadata = { title: "Kairos intro" };

// Self-playing intro for the demo video. ?beat=1..5 shows one beat and holds it (for stills).
export default function IntroPage({ searchParams }: PageProps<"/intro">) {
  return (
    <Suspense>
      <Player searchParams={searchParams} />
    </Suspense>
  );
}

async function Player({ searchParams }: Pick<PageProps<"/intro">, "searchParams">) {
  const n = Number((await searchParams).beat);
  return <Intro only={Number.isInteger(n) && n >= 1 && n <= 5 ? n - 1 : undefined} />;
}
