import { moveContext } from "@/lib/inventory-loader";
import { ScanClient } from "@/app/admin/inventory/scan/scan-client";
import { requireFieldPage } from "../access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scan" };

/**
 * Scan stock — the back office's scanner (2026-09-25), reused as it is rather
 * than copied: one scanner, one set of lookup and move rules.
 */
export default async function FieldScanPage() {
  await requireFieldPage();
  const ctx = await moveContext();
  return (
    <>
      <header className="mb-5">
        <h1 className="text-[24px] font-bold leading-tight">Scan stock</h1>
        <p className="text-[var(--text-muted)]">
          Point the camera at a label. Open each unit, or collect several and record one move.
        </p>
      </header>
      <ScanClient ctx={ctx} />
    </>
  );
}
