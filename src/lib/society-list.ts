/**
 * The societies list: live filtering and header sorting (2026-09-26,
 * user-asked). Pure, so the order a reader sees is decided in one tested
 * place.
 *
 * Default order: by the date billing started — the completion certificate's
 * billing start, else the contract's term start (the rule invoices bill
 * from) — and where billing has not started, the date the agreement was
 * signed. Newest first. A society with neither sinks to the end in BOTH
 * directions: "sort by billing start" means "show me the ones that have one".
 */
export type SocietyRow = {
  id: string;
  name: string;
  location: string;
  flatCount: number | null;
  lights: number | null;
  circuits: number;
  serviceLines: string[];
  status: string;
  /** Derived standing — see societyStanding. */
  standing: Standing;
  /** At least one payment recorded against one of its bills. */
  paying: boolean;
  /** ISO day billing started, or null. */
  billingStart: string | null;
  /** ISO day the (earliest) agreement was signed, or null. */
  signedOn: string | null;
};

export type SortKey = "started" | "name" | "flats" | "lights" | "serviceLines" | "circuits" | "status";
export type SortDir = "asc" | "desc";

/**
 * What a society IS, commercially (2026-09-26, the user's definitions):
 * active means billing has started — not that an agreement was executed —
 * and paying means at least one bill payment has been recorded. Suspended
 * and terminated are recorded acts and stand as recorded. Everything before
 * billing starts is a prospect.
 */
export type Standing = "prospect" | "active" | "suspended" | "terminated";

export function societyStanding(i: { status: string; billingStart: string | null; today: string }): Standing {
  if (i.status === "terminated") return "terminated";
  if (i.status === "suspended") return "suspended";
  return i.billingStart !== null && i.billingStart <= i.today ? "active" : "prospect";
}

/** The date the default order uses, and which kind of date it is. */
export function startedOn(r: SocietyRow): { date: string; kind: "billing" | "signed" } | null {
  if (r.billingStart) return { date: r.billingStart, kind: "billing" };
  if (r.signedOn) return { date: r.signedOn, kind: "signed" };
  return null;
}

/** Text starts from the front; figures and dates from the far end. */
export function firstDirection(key: SortKey): SortDir {
  return key === "name" || key === "status" || key === "serviceLines" ? "asc" : "desc";
}

const STATUS_ORDER = ["active", "prospect", "suspended", "terminated"];

function valueOf(r: SocietyRow, key: SortKey): string | number | null {
  switch (key) {
    case "started":
      return startedOn(r)?.date ?? null;
    case "name":
      return r.name.toLowerCase();
    case "flats":
      return r.flatCount;
    case "lights":
      return r.lights;
    case "serviceLines":
      return r.serviceLines.length === 0 ? null : [...r.serviceLines].sort().join(",");
    case "circuits":
      return r.circuits === 0 ? null : r.circuits;
    case "status": {
      // Paying first, then active, prospect, suspended, terminated.
      const i = STATUS_ORDER.indexOf(r.standing);
      return (i === -1 ? STATUS_ORDER.length : i) * 2 + (r.paying ? 0 : 1);
    }
  }
}

export function sortSocieties(rows: readonly SocietyRow[], key: SortKey, dir: SortDir): SocietyRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = valueOf(a, key);
    const vb = valueOf(b, key);
    if (va === null && vb === null) return a.name.localeCompare(b.name);
    if (va === null) return 1;
    if (vb === null) return -1;
    const c = va < vb ? -1 : va > vb ? 1 : 0;
    return c !== 0 ? c * sign : a.name.localeCompare(b.name);
  });
}

/** Every word of the query must appear in the name or location, any order. */
export function matchesQuery(r: SocietyRow, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = `${r.name} ${r.location}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}
