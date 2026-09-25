"use client";

export function PrintLabelsButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-primary btn-sm no-print">
      Print labels
    </button>
  );
}
