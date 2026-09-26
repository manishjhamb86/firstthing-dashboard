/**
 * Who the portal dashboard greets (2026-09-26, user-caught: "Good day, The").
 *
 * Portal logins are sometimes named after the society itself ("The Hyde
 * Park"), so taking the first word of the name greeted an article. The rule:
 * a person's name greets them by first name; a login named after its society
 * — or with no name at all — greets the society by its full name; and a first
 * word that is a title or an article is never used on its own.
 */
const NOT_A_FIRST_NAME = new Set(["the", "mr", "mrs", "ms", "miss", "dr", "shri", "smt", "sri", "m/s"]);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function greetingName(name: string | null | undefined, societyName: string): string {
  const n = name?.trim() ?? "";
  if (n === "") return societyName;
  const a = norm(n);
  const b = norm(societyName);
  if (a === b || (b.length > 0 && (a.includes(b) || b.includes(a)))) return societyName;
  const first = n.split(/\s+/)[0];
  if (NOT_A_FIRST_NAME.has(first.toLowerCase().replace(/\.$/, "")) || first.replace(/\./g, "").length <= 1) return n;
  return first;
}
