/**
 * The jump-to search's matching (2026-11-19), pure so it is tested. Every
 * word typed must appear somewhere in the label, its group or its detail,
 * in any order; a label that starts with the query ranks first, then one
 * with a word starting with it, then any match. With nothing typed it shows
 * the pages, so the box doubles as a list of everything reachable.
 */
export type JumpPage = { label: string; href: string; group?: string; keywords?: string };
export type JumpSociety = { id: string; name: string; location: string };
export type JumpResult = { kind: "page" | "society"; label: string; href: string; detail: string };

const MAX_PAGES = 8;
const MAX_SOCIETIES = 8;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function score(label: string, haystack: string, words: string[], q: string): number {
  if (!words.every((w) => haystack.includes(w))) return -1;
  const l = norm(label);
  if (l.startsWith(q)) return 3;
  if (l.split(/[\s&,·›-]+/).some((w) => w.startsWith(words[0]))) return 2;
  return 1;
}

export function jumpResults(query: string, pages: JumpPage[], societies: JumpSociety[]): JumpResult[] {
  const q = norm(query);
  const words = q.split(" ").filter(Boolean);
  const pageRow = (p: JumpPage): JumpResult => ({ kind: "page", label: p.label, href: p.href, detail: p.group ?? "" });
  if (words.length === 0) return pages.slice(0, MAX_PAGES).map(pageRow);

  const rank = <T,>(rows: T[], label: (r: T) => string, hay: (r: T) => string) =>
    rows
      .map((r, i) => ({ r, i, s: score(label(r), norm(hay(r)), words, q) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map((x) => x.r);

  const p = rank(pages, (x) => x.label, (x) => `${x.label} ${x.group ?? ""} ${x.keywords ?? ""}`).slice(0, MAX_PAGES).map(pageRow);
  const s = rank(societies, (x) => x.name, (x) => `${x.name} ${x.location}`)
    .slice(0, MAX_SOCIETIES)
    .map((x): JumpResult => ({ kind: "society", label: x.name, href: `/admin/societies/${x.id}`, detail: x.location }));
  return [...p, ...s];
}
