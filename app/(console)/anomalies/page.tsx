import { Suspense } from "react";
import { connection } from "next/server";
import { loadKit } from "@/lib/kit";
import { currentReviews } from "@/lib/reviews";
import { PageHeader } from "@/components/page-header";
import { inboxCounts, toTab, TriageInbox } from "@/components/triage-inbox";

export default function Anomalies({ searchParams }: PageProps<"/anomalies">) {
  return (
    <Suspense fallback={<PageHeader title="Anomalies" subtitle="Loading triage state…" />}>
      <Inbox searchParams={searchParams} />
    </Suspense>
  );
}

async function Inbox({ searchParams }: Pick<PageProps<"/anomalies">, "searchParams">) {
  await connection();
  const [kit, reviews, { tab }] = await Promise.all([loadKit(), currentReviews(), searchParams]);
  const counts = inboxCounts(kit, reviews);
  return (
    <>
      <PageHeader
        title="Anomalies"
        subtitle={`${counts.open} need you (${counts.critical} critical) · ${kit.anomalies.length} found across ${kit.missions.length} missions · ranked by severity, then asset criticality`}
      />
      <main className="mx-auto max-w-[1440px] px-8 py-6">
        <TriageInbox kit={kit} reviews={reviews} tab={toTab(tab)} basePath="/anomalies" />
      </main>
    </>
  );
}
