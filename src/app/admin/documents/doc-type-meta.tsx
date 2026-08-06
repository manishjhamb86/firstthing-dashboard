import {
  Receipt,
  TrendingUp,
  ClipboardCheck,
  Gauge,
  FileSearch,
  FileCheck2,
  FileSignature,
  IdCard,
  type LucideIcon,
} from "lucide-react";
import type { StatusTone } from "@/components/shell/StatusChip";

export type DocType = "invoice" | "savingsReport" | "inspectionReport";

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  invoice: "Invoice",
  savingsReport: "Savings Report",
  inspectionReport: "Inspection Report",
};

export const DOC_TYPE_ICON: Record<DocType, LucideIcon> = {
  invoice: Receipt,
  savingsReport: TrendingUp,
  inspectionReport: ClipboardCheck,
};

export const DOC_TYPE_TONE: Record<DocType, StatusTone> = {
  invoice: "info",
  savingsReport: "good",
  inspectionReport: "warning",
};

export const DOC_TYPE_DESC: Record<DocType, string> = {
  invoice: "Upload the PDF — AI reads it and fills in the form for you",
  savingsReport: "Monthly energy & cost savings summary PDF",
  inspectionReport: "Field inspection findings and fault report PDF",
};

export const COMING_SOON: { value: string; label: string; icon: LucideIcon; desc: string }[] = [
  { value: "meterReadings", label: "Meter Readings", icon: Gauge, desc: "Energy meter photo readings" },
  { value: "preDemoReport", label: "Pre-Demo Report", icon: FileSearch, desc: "Baseline site audit before install" },
  { value: "postDemoReport", label: "Post-Demo Report", icon: FileCheck2, desc: "Results after installation" },
  { value: "agreement", label: "Agreement", icon: FileSignature, desc: "Signed customer agreement" },
  { value: "gatePass", label: "Gate Pass", icon: IdCard, desc: "Site visit / vendor gate pass" },
];
