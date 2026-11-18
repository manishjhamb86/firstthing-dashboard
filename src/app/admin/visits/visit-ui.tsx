import { StatusChip, type ChipTone } from "@/components/ui";
import type { CustomerVisitStatus } from "@prisma/client";
import { STATUS_LABEL, type MonthVisitState } from "@/lib/customer-visits";

/** One wording for a visit's state on every screen. */
export function VisitStatusChip({ status, voided = false }: { status: CustomerVisitStatus; voided?: boolean }) {
  if (voided) return <StatusChip tone="neu">Withdrawn</StatusChip>;
  const tone: Record<CustomerVisitStatus, ChipTone> = { pending: "info", approved: "ok", sent_back: "bad" };
  return <StatusChip tone={tone[status]}>{STATUS_LABEL[status]}</StatusChip>;
}

export function MonthStateChip({ state, late }: { state: MonthVisitState; late: boolean }) {
  const meta: Record<MonthVisitState, [ChipTone, string]> = {
    approved: ["ok", "Approved"],
    pending: ["info", "Waiting for approval"],
    sent_back: ["bad", "Sent back"],
    missing: [late ? "bad" : "warn", "Not visited yet"],
  };
  const [tone, label] = meta[state];
  return <StatusChip tone={tone}>{label}</StatusChip>;
}

export function currentPeriod(today: string): string {
  return today.slice(0, 7);
}
