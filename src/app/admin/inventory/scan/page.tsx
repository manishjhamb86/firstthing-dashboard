import { PageHeader } from "@/components/ui";
import { moveContext } from "@/lib/inventory-loader";
import { requireInventoryPage } from "../access";
import { ScanClient } from "./scan-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scan stock" };

/**
 * Scan labels with the phone's camera (2026-09-25). Two ways to use it: open
 * each unit as it is scanned, or collect a pile of them — forty lights going
 * out to one society — and record the move once for all of them.
 */
export default async function ScanPage() {
  await requireInventoryPage();
  const ctx = await moveContext();
  return (
    <>
      <PageHeader backHref="/admin/inventory" title="Scan stock" subtitle="Point the camera at a label. A phone's own camera app also opens a unit straight from its label." />
      <ScanClient ctx={ctx} />
    </>
  );
}
