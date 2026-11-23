import type { ChipTone } from "@/components/ui";

export const PR_STATUS: Record<string, { label: string; tone: ChipTone }> = {
  draft: { label: "Draft", tone: "neu" },
  sent: { label: "Sent to supplier", tone: "info" },
  partly_received: { label: "Partly received", tone: "warn" },
  received: { label: "Received", tone: "ok" },
  cancelled: { label: "Cancelled", tone: "neu" },
};
