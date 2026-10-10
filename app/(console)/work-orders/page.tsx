import { Suspense } from "react";
import { connection } from "next/server";
import { loadKit } from "@/lib/kit";
import { currentReviews } from "@/lib/reviews";
import { PageHeader } from "@/components/page-header";
import { WorkOrderList } from "@/components/work-order-list";

const SUBTITLE = "Created from anomaly triage. In a plant these go to the maintenance system (CMMS); that hand-off is not connected in this demo.";

export default function WorkOrdersPage() {
  return (
    <Suspense fallback={<PageHeader title="Work orders" subtitle={SUBTITLE} />}>
      <WorkOrders />
    </Suspense>
  );
}

async function WorkOrders() {
  await connection();
  const now = new Date();
  const [kit, reviews] = await Promise.all([loadKit(), currentReviews()]);
  return (
    <>
      <PageHeader title="Work orders" subtitle={SUBTITLE} />
      <main className="mx-auto max-w-[1440px] px-8 py-6">
        <p className="mb-3 text-[11px] tracking-wider text-helper uppercase">P1: critical anomaly or critical asset · P2: high severity · P3: everything else</p>
        <WorkOrderList kit={kit} reviews={reviews} now={now} />
      </main>
    </>
  );
}
