/**
 * One-off repair (2026-11-05, user-caught): InvoiceIntake
 * cmvvgh1ft04s634p7sokywijx (FT/2026-27/114, Arihant Arden) was stuck at
 * status "could_not_read" with a fully correct `extraction` and `review`
 * already stored — a later retry had failed (the bug fixed the same day in
 * invoice-intake-extract.ts) and overwrote the status without checking
 * that the row already held a good read. No Gemini call needed: re-runs
 * the real storeExtraction() against the extraction already on the row,
 * which recomputes the duplicate check and the correct status exactly as
 * a fresh successful read would.
 *
 * pnpm tsx scripts/fix-arihant-arden-invoice-114-status.ts --dry-run
 * pnpm tsx scripts/fix-arihant-arden-invoice-114-status.ts
 */
import "./load-env";
import { db } from "../src/lib/db";
import { storeExtraction } from "../src/lib/invoice-intake-extract";
import type { ExtractedInvoice } from "../src/lib/invoice-extract";

const dryRun = process.argv.includes("--dry-run");

const INTAKE_ID = "cmvvgh1ft04s634p7sokywijx";
const ACTOR_ID = "cmt9ocs8l0000nnqsiztkadmc"; // yogesh@firsthing.earth

async function main() {
  const intake = await db.invoiceIntake.findUnique({ where: { id: INTAKE_ID } });
  if (!intake) throw new Error("Intake row not found — aborting.");
  if (intake.status !== "could_not_read") throw new Error(`Expected status could_not_read, found ${intake.status} — state has moved, aborting.`);
  const extraction = intake.extraction as unknown as ExtractedInvoice | null;
  if (!extraction || !extraction.lines || extraction.lines.length === 0) {
    throw new Error("No usable extraction stored on this row — aborting rather than guessing.");
  }

  console.log("Before:", { status: intake.status, extractionError: intake.extractionError, lineCount: extraction.lines.length, total: extraction.total?.value });

  if (dryRun) {
    console.log("--dry-run: would call storeExtraction() with the existing extraction data. No writes made.");
    return;
  }

  const result = await storeExtraction(INTAKE_ID, extraction, ACTOR_ID);
  console.log("storeExtraction result:", result);

  const after = await db.invoiceIntake.findUnique({ where: { id: INTAKE_ID }, select: { status: true, extractionError: true, societyId: true, period: true } });
  console.log("After:", after);
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
