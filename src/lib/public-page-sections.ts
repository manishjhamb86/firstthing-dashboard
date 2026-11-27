/**
 * The sections of a society's public page that the back office can show or
 * hide (2026-11-27, user-asked: "what to show what to not"). The hero, the
 * spotlight card, the contact band and the footer always show — they are
 * the page itself. RWA members keep their own switch (publicShowLeadership).
 */
export const PUBLIC_SECTIONS = [
  { key: "initiatives", label: "What's been done", hint: "The cards for lights, tanks and pump-room automation." },
  { key: "impact", label: "Energy saved", hint: "kWh saved, % saving and months verified, from released months only. Never rupees." },
  { key: "story", label: "Community story", hint: "A paragraph about the society, with its location and partner-since date." },
  { key: "testimonial", label: "A word from the RWA", hint: "The society's latest published testimonial." },
  { key: "recognition", label: "Certificate of recognition", hint: "The printable certificate." },
] as const;

export type PublicSectionKey = (typeof PUBLIC_SECTIONS)[number]["key"];

export function cleanHiddenSections(keys: string[]): PublicSectionKey[] {
  const valid = new Set<string>(PUBLIC_SECTIONS.map((s) => s.key));
  return [...new Set(keys.filter((k) => valid.has(k)))] as PublicSectionKey[];
}
