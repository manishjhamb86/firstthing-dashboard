import type { SavingsBand } from "@/lib/circuit-load";
import type { ChipTone } from "@/components/ui";

/**
 * Small presentational pieces the portal pages share. Hook-free, so Server
 * Components render them directly — the same rule as ui.tsx.
 */

/**
 * Band → chip tone, the same mapping the monthly report settled (2026-08-29):
 * the band's own accent inks fail contrast at chip sizes, so the wording goes
 * through the app's contrast-tuned StatusChip tones. Six bands to five tones
 * is fine — the label is always the band's own words.
 */
export const BAND_TONE: Record<SavingsBand, ChipTone> = {
  green: "ok",
  cyan: "info",
  yellow: "warn",
  orange: "warn",
  red: "bad",
  suspect: "warn",
};

export function monthName(month: string): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return month;
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "Wed 10" — same in-table date rule as the monthly report. */
export function dayShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });
}

export function timeAgoShort(at: Date, now: Date = new Date()): string {
  const mins = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.floor(h / 24);
  if (days === 1) return "yesterday";
  if (days < 31) return `${days} days ago`;
  return at.toISOString().slice(0, 10);
}
