// How a warranty reads on screen — one place, so every inventory page says it the same way.
import { formatDate } from "@/lib/format-date";
import { warrantyState, warrantyUntil } from "@/lib/inventory";
import type { ChipTone } from "@/components/ui";

export function warrantyView(input: {
  warrantyMonths: number | null;
  basis: "purchase" | "install";
  purchaseDate: Date;
  deployedOn: Date | null;
  now: Date;
}): { label: string; tone: ChipTone; until: Date | null; state: ReturnType<typeof warrantyState> } {
  const until = warrantyUntil(input);
  const state = warrantyState(until, !!input.warrantyMonths, input.now);
  const label =
    state === "none"
      ? "No warranty stated"
      : state === "not_started"
        ? "Starts on installation"
        : state === "expired"
          ? `Expired ${formatDate(until!)}`
          : `${state === "expiring" ? "Expires" : "Until"} ${formatDate(until!)}`;
  const tone: ChipTone = state === "expired" ? "bad" : state === "expiring" ? "warn" : state === "valid" ? "ok" : "neu";
  return { label, tone, until, state };
}
