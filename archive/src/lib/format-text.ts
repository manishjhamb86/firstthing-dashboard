// Simple title-case: capitalizes the first letter of each whitespace-separated
// word, lowercases the rest. Doesn't special-case acronyms (e.g. "ASF" ->
// "Asf") — a predictable, simple rule beats trying to guess which words are
// acronyms.
export function toTitleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => (word.length ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(" ");
}
