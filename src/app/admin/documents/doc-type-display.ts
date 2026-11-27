/**
 * How each document type is shown on the Documents page (2026-11-27
 * redesign): its group on the type picker, a one-line "what happens", and an
 * icon path. Plain module — the picker (client) and the recently-filed list
 * both read it. The catalog itself (src/lib/document-catalog.ts) still
 * decides what a valid file is and where it goes.
 */
export const DOC_GROUPS = ["KYC", "Agreements & bills", "Past reports & site papers"] as const;

const ICON = {
  id: "M4 6h16v12H4zM8 10h4M8 14h8",
  bill: "M6 2h9l3 3v17H6zM9 9h6M9 13h6M9 17h4",
  pen: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  inv: "M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6",
  box: "M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
  chart: "M3 3v18h18M7 15l4-4 3 3 5-6",
  check: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  gate: "M3 21V8l9-5 9 5v13M9 21v-6h6v6",
  before: "M12 8v4l3 2M12 3a9 9 0 1 0 9 9",
  meter: "M13 2 3 14h9l-1 8 10-12h-9z",
  doc: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6",
};

export type DocTypeDisplay = { group: (typeof DOC_GROUPS)[number] | null; short: string; icon: string; tone: "accent" | "warn" | "ok" | "neu" };

const DISPLAY: Record<string, DocTypeDisplay> = {
  kycGstCertificate: { group: "KYC", short: "Settles the KYC step", icon: ICON.id, tone: "accent" },
  kycElectricityBill: { group: "KYC", short: "Settles the KYC step", icon: ICON.bill, tone: "accent" },
  agreement: { group: "Agreements & bills", short: "The signed copy on record", icon: ICON.pen, tone: "accent" },
  nonServiceInvoice: { group: "Agreements & bills", short: "Devices, installation, one-offs", icon: ICON.box, tone: "warn" },
  invoiceCopy: { group: null, short: "Filed from Invoice intake", icon: ICON.inv, tone: "warn" },
  preDemoReport: { group: "Past reports & site papers", short: "From before the system", icon: ICON.before, tone: "ok" },
  postDemoReport: { group: "Past reports & site papers", short: "From before the system", icon: ICON.chart, tone: "ok" },
  savingsReport: { group: "Past reports & site papers", short: "An older monthly report", icon: ICON.chart, tone: "ok" },
  inspectionReport: { group: "Past reports & site papers", short: "A scanned site checklist", icon: ICON.check, tone: "ok" },
  gatePass: { group: "Past reports & site papers", short: "Filed by its date and time", icon: ICON.gate, tone: "ok" },
  meterReadings: { group: null, short: "Imported on the meter's page", icon: ICON.meter, tone: "neu" },
};

export function docTypeDisplay(id: string): DocTypeDisplay {
  return DISPLAY[id] ?? { group: null, short: "", icon: ICON.doc, tone: "neu" };
}

export const TONE_STYLE: Record<DocTypeDisplay["tone"], { bg: string; fg: string }> = {
  accent: { bg: "var(--accent-subtle)", fg: "var(--accent-deep)" },
  warn: { bg: "var(--warn-bg)", fg: "var(--warn-fg)" },
  ok: { bg: "var(--ok-bg)", fg: "var(--ok-fg)" },
  neu: { bg: "var(--neu-bg)", fg: "var(--text-muted)" },
};
