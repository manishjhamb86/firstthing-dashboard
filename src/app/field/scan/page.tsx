import { moveContext } from "@/lib/inventory-loader";
import { requireFieldPage } from "../access";
import { FieldScan } from "./field-scan";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scan" };

/**
 * Scan stock — the back office's scanner (2026-09-25), reused rather than
 * copied, with a queued move so a pile of lights can be recorded with no
 * signal (FieldScan).
 */
export default async function FieldScanPage() {
  await requireFieldPage();
  const ctx = await moveContext();
  return (
    <>
      <header className="mb-5">
        <h1 className="text-[24px] font-bold leading-tight">Scan stock</h1>
        <p className="text-[var(--text-muted)]">
          Point the camera at a label. Collect a pile and record one move — with or without signal.
        </p>
      </header>
      <FieldScan ctx={ctx} />
    </>
  );
}
