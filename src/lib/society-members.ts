// Society members & positions (2026-09-25) — pure rules, one place.

/** "+91 98110 22159", "098110-22159", "9811022159" → "9811022159"; null if not an Indian mobile. */
export function normaliseMobile(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+91")) d = d.slice(3);
  else if (d.startsWith("0091")) d = d.slice(4);
  else if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** 98110 22159 — how a stored mobile reads. */
export function formatMobile(m: string): string {
  return m.length === 10 ? `${m.slice(0, 5)} ${m.slice(5)}` : m;
}

/** A position's duplicate key: case, spacing and punctuation make no new position. */
export function positionKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export type MemberInput = { name: string; mobile: string; email: string; positionId: string; newPosition: string };

/** Why a member cannot be saved as entered, or null. */
export function refuseMember(input: MemberInput): string | null {
  if (!input.name.trim()) return "Enter the member's name.";
  if (!input.mobile.trim()) return "Enter their mobile number.";
  if (!normaliseMobile(input.mobile)) return `"${input.mobile.trim()}" is not a 10-digit Indian mobile number.`;
  if (input.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return "That email address does not look right.";
  if (!input.positionId && !positionKey(input.newPosition)) return "Choose their position, or add a new one.";
  return null;
}

/** Why a member cannot be ended as asked, or null. */
export function refuseEnd(input: { endedOn: string; reason: string; startedOn: Date | null; now: Date }): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.endedOn)) return "Choose the date they stopped.";
  const ended = new Date(`${input.endedOn}T00:00:00Z`);
  const today = Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), input.now.getUTCDate());
  if (ended.getTime() > today) return "The date cannot be in the future.";
  if (input.startedOn && ended < input.startedOn) return "They cannot have stopped before they started.";
  if (!input.reason.trim()) return "Say why — e.g. term ended, resigned, moved out.";
  return null;
}

/** Generate a readable temporary password — shown once to hand over. */
export function temporaryPassword(random: () => number = Math.random): string {
  const words = ["Lamp", "River", "Tower", "Cedar", "Amber", "Delta", "Maple", "Orbit", "Pearl", "Solar"];
  const w = () => words[Math.floor(random() * words.length)];
  return `${w()}-${w()}-${1000 + Math.floor(random() * 9000)}`;
}
