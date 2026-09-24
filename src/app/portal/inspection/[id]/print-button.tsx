"use client";

// Same pattern as the circuit reports' own PrintButton
// (report-shared.tsx) — window.print() plus the page's .print-doc/
// .no-print rules, not a PDF-generation dependency.
export function PrintInspectionButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-tone-info no-print">
      Print / save as PDF
    </button>
  );
}
