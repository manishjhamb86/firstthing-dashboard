/**
 * A society's public page lives at firsthing.earth/<slug> (2026-11-27). The
 * slug sits at the top level of the site, beside the app's own paths, so a
 * few words are reserved; and a visit is matched on letters and digits only,
 * so /hydepark and /hyde-park open the same page whichever the RWA prints.
 * The migration that backfilled every society uses the same rule.
 */

/** Top-level paths the app itself owns — a society can never take one. */
export const RESERVED_SLUG_KEYS = new Set([
  "admin", "portal", "field", "fieldicon", "login", "api", "marketing", "i", "icon",
  "next", "favicon", "robots", "sitemap", "manifest", "logout", "signup", "static",
  "public", "brand", "s",
]);

/** "The Hyde Park" → "hyde-park". */
export function slugFromName(name: string): string {
  const s = name
    .trim()
    .replace(/^the\s+/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "society";
}

/** What a visit is matched on: "Hyde-Park" and "hydepark" are both "hydepark". */
export function slugKey(slug: string): string {
  return slug.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Tidies what someone typed into the address field. */
export function normaliseSlug(typed: string): string {
  return typed
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/[^/]+\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function refuseSlug(slug: string): string | null {
  if (!slug) return "Give the page an address.";
  if (slug.length < 3) return "The address needs at least 3 letters or digits.";
  if (slug.length > 60) return "Keep the address under 60 characters.";
  if (RESERVED_SLUG_KEYS.has(slugKey(slug))) return `"${slug}" is one of the site's own pages — pick another address.`;
  return null;
}
