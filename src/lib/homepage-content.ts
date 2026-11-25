// What the public homepage shows from the back office (2026-11-25,
// user-asked): customer testimonials, and the "Real Buildings. Measurable
// Results." societies. Pure rules; the loaders and actions wrap them.

export const QUOTE_MIN = 20;
export const QUOTE_MAX = 600;

/** Why a testimonial cannot be saved, or null. Consent is required from a customer. */
export function refuseTestimonial(t: { quote: string; authorName: string; consent?: boolean; needsConsent?: boolean }): string | null {
  const q = t.quote.trim();
  if (q.length < QUOTE_MIN) return `Write at least ${QUOTE_MIN} characters.`;
  if (q.length > QUOTE_MAX) return `Keep it under ${QUOTE_MAX} characters.`;
  if (!t.authorName.trim()) return "Enter the name to show under it.";
  if (t.authorName.trim().length > 80) return "Keep the name under 80 characters.";
  if (t.needsConsent && !t.consent) return "Tick the box to agree to it being shown on our website.";
  return null;
}

export type SocietyFigures = {
  societyId: string;
  name: string;
  location: string;
  /** Weighted across every published month; null when none carries one. */
  savingsPct: number | null;
  /** ₹ saved across every published month. */
  savedValue: number;
  months: number;
};

export type StatSetting = { mode: "auto" | "pinned" | "held"; priority: number };

export type RankedSociety = SocietyFigures & { mode: "auto" | "pinned" | "held"; priority: number; shown: boolean; rank: number | null };

/**
 * The homepage order: pinned societies first (lower priority first), then the
 * rest by savings %, then ₹ saved. Held ones and ones with no published
 * figure never show. Returns every society with its place, so the back office
 * can see why each is or is not on the homepage.
 */
export function rankHomepageSocieties(rows: SocietyFigures[], settings: Map<string, StatSetting>, limit: number): RankedSociety[] {
  const withMode = rows.map((r) => {
    const s = settings.get(r.societyId);
    return { ...r, mode: s?.mode ?? "auto", priority: s?.priority ?? 100 } as RankedSociety;
  });
  const eligible = withMode.filter((r) => r.mode !== "held" && r.savingsPct !== null && r.months > 0);
  const pinned = eligible.filter((r) => r.mode === "pinned").sort((a, b) => a.priority - b.priority || (b.savingsPct ?? 0) - (a.savingsPct ?? 0));
  const auto = eligible.filter((r) => r.mode === "auto").sort((a, b) => (b.savingsPct ?? 0) - (a.savingsPct ?? 0) || b.savedValue - a.savedValue);
  const order = [...pinned, ...auto];
  const rankOf = new Map(order.map((r, i) => [r.societyId, i + 1]));
  return withMode
    .map((r) => {
      const rank = rankOf.get(r.societyId) ?? null;
      return { ...r, rank, shown: rank !== null && rank <= limit };
    })
    .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.name.localeCompare(b.name));
}

/** "₹12.4 lakh", "₹1.2 crore", "₹48,000" — the homepage's rupee figure. */
export function rupeesShort(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(n >= 1e8 ? 0 : 1)} crore`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(n >= 1e6 ? 0 : 1)} lakh`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
