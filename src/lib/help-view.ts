import type { ChipTone } from "@/components/ui";
import { HELP_CATEGORY_LABEL, type HelpCategory, type HelpStatusValue } from "@/lib/help-report";

/** How a report's state reads — the same words on the phone and in the back office. */
export const HELP_STATUS_META: Record<HelpStatusValue, { label: string; tone: ChipTone }> = {
  new: { label: "Being read", tone: "neu" },
  open: { label: "With the office", tone: "warn" },
  answered: { label: "Answered", tone: "ok" },
  in_progress: { label: "Being worked on", tone: "info" },
  resolved: { label: "Resolved", tone: "ok" },
};

export function helpCategoryLabel(c: HelpCategory | null | undefined): string {
  return c ? HELP_CATEGORY_LABEL[c] : "Not sorted yet";
}
