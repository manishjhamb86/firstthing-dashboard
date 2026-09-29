import { isoDateTimeLocal } from "@/lib/format-date";
import { inspectionNow } from "@/lib/inspection-file";
import { loadInspectionChoices } from "@/lib/inspection-choices";
import { requireFieldPage } from "../../access";
import { FieldInspectionForm } from "./field-inspection-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Monthly inspection" };

/**
 * The monthly inspection, on the phone — the first form that works with no
 * signal (docs/engineering/19-field-app.md §8 step 4). This page is kept on
 * the phone by the service worker's warm-up, so it opens in a basement; what
 * is typed is saved on the phone and sent when there is signal.
 */
export default async function FieldNewInspectionPage() {
  const me = await requireFieldPage();
  const { societies, circuits } = await loadInspectionChoices();
  // India's wall clock, computed once here (a client `new Date()` would
  // disagree with this render across a minute boundary).
  const now = inspectionNow();
  return (
    <>
      <header className="mb-5">
        <h1 className="text-[24px] font-bold leading-tight">Monthly inspection</h1>
        <p className="text-[var(--text-muted)]">
          Record only the fixtures that are faulty. Filed as {me.name ?? me.email}.
        </p>
      </header>
      <FieldInspectionForm
        societies={societies}
        circuits={circuits}
        initialPeriod={isoDateTimeLocal(now).slice(0, 7)}
        initialInspectedAt={isoDateTimeLocal(now)}
      />
    </>
  );
}
