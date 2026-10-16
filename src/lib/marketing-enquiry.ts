// The public homepage's "Request an Assessment" form (2026-10-16). Pure
// rules, one place — the standing convention for every write path in this
// codebase, even one as small as this.

import { normaliseMobile } from "@/lib/society-members";

export const MARKETING_INTERESTS = [
  "Smart Lighting",
  "Pump Automation",
  "Water Automation",
  "Energy Monitoring",
  "Multiple Solutions",
] as const;

export type MarketingEnquiryInput = {
  name: string;
  organisation: string;
  mobile: string;
  interest: string;
};

// A generous length cap, not a real validation rule — the one safeguard a
// form with no account and no session behind it needs against someone
// pasting in paragraphs of text, since nothing else here bounds the row.
const MAX_FIELD_LENGTH = 200;

/**
 * Why a public enquiry cannot be recorded, or null. Deliberately more
 * forgiving than this codebase's internal forms: the person submitting this
 * has no account, no permission, no prior record — it is a stranger's first
 * contact, not an act with authority behind it (INV-01 does not apply here;
 * nothing this produces can ever mint a session or touch an existing row).
 */
export function refuseMarketingEnquiry(input: MarketingEnquiryInput): string | null {
  const name = input.name.trim();
  const organisation = input.organisation.trim();
  if (!name) return "Enter your name.";
  if (name.length > MAX_FIELD_LENGTH) return "That name is too long.";
  if (!organisation) return "Enter your society or organisation.";
  if (organisation.length > MAX_FIELD_LENGTH) return "That name is too long.";
  if (!normaliseMobile(input.mobile)) return "Enter a 10-digit Indian mobile number.";
  if (!(MARKETING_INTERESTS as readonly string[]).includes(input.interest)) return "Choose what you're interested in.";
  return null;
}
