/**
 * A meter's lifecycle — which circuit it measured, and when.
 *
 * Researched 2026-09-09, because meters get reused: pulled out of one society,
 * installed in another, and usually renamed on the way. What the research
 * settled, and what each finding decides here:
 *
 *  - The permanent metering point and the movable meter asset are DIFFERENT
 *    entities (IEC CIM / Netbeheer NL and Green Button ESPI both hold a
 *    UsagePoint distinct from the meter measuring it). `Circuit` is our
 *    metering point; `MeterDevice` is the asset, and its identity is the
 *    vendor's own `ewelinkDeviceId` — not its name, which is exactly what a
 *    rename on reuse changes.
 *
 *  - The link between them is an EFFECTIVE-DATED interval. UK settlement
 *    (REC/MHHS) keeps, per metering point, a meter history of instances each
 *    carrying Meter ID, Install Date and Remove Date. That is
 *    `MeterInstallation`: one row per stay, half-open [installedAt, removedAt).
 *
 *  - A meter exchange sets the outgoing Remove Date EQUAL to the incoming
 *    Install Date, so the series has no gap (REC/MHHS). `moveTo` below does
 *    exactly that: one instant closes one stay and opens the next.
 *
 *  - Attribution is resolved by TRAVERSING the intervals, not by trusting the
 *    meter's current pointer. Oracle MDM stores measurement against the device
 *    channel and resolves the service point at usage-calculation time; the NEM
 *    keeps both the point (NMI) and the device (MeterSerialNumber) on the
 *    reading record. This build does both, in the two places it already has:
 *    `MeterHourlyReading` stays the meter's own unbounded record, and the
 *    projection to `MeterReading` is where the interval decides the circuit —
 *    writing the resolved circuit AND the meter that produced it.
 *
 * Pure on purpose, so the arithmetic is testable without a request context —
 * the same convention as `benchmark-rescale.ts` and `portal-authority.ts`.
 */

export type Installation = {
  id: string;
  circuitId: string;
  societyId: string;
  installedAt: Date;
  /** Null while still installed. Half-open: the removal instant is excluded. */
  removedAt: Date | null;
};

/** Whether an instant falls inside a stay. Half-open — [installedAt, removedAt). */
export function covers(i: Installation, at: Date): boolean {
  if (at.getTime() < i.installedAt.getTime()) return false;
  return i.removedAt === null || at.getTime() < i.removedAt.getTime();
}

/**
 * The stay a reading belongs to, or null when the meter was nowhere we know.
 *
 * A day with no covering stay is NOT an error and never an estimate: the meter
 * really did record it, we simply have no installation saying whose it was.
 * It stays in the meter's own store and is left out of every circuit.
 */
export function installationAt(
  installations: readonly Installation[],
  at: Date,
): Installation | null {
  return installations.find((i) => covers(i, at)) ?? null;
}

/** The stay currently open, if any. */
export function currentInstallation(
  installations: readonly Installation[],
): Installation | null {
  return installations.find((i) => i.removedAt === null) ?? null;
}

export type OverlapRefusal = { at: "meter" | "circuit"; message: string };

/**
 * Whether opening a stay would collide with one already on record.
 *
 * The database holds two exclusion constraints for this, which is what
 * actually guarantees it — two concurrent assignments both find nothing and
 * both insert, so an application check cannot win that race. This function
 * exists to REFUSE IN WORDS before the constraint refuses in Postgres, so an
 * operator gets a sentence rather than a 500.
 *
 * The stricter of the two — one meter per circuit at a time — is a deliberate
 * narrowing of the UK rule, which only forbids two instances of the same meter
 * serial on one point and lets an MPAN hold several meters. CON-11 makes the
 * circuit the billing grain, so two meters on one circuit would be two sources
 * for one billed figure that INV-02 cannot resolve.
 */
export function refuseOverlap(input: {
  installedAt: Date;
  removedAt?: Date | null;
  /** Every stay this METER already has. */
  meterStays: readonly Installation[];
  /** Every stay this CIRCUIT already has. */
  circuitStays: readonly Installation[];
  /** Ignored when re-checking an existing row against itself. */
  ignoreId?: string;
}): OverlapRefusal | null {
  const from = input.installedAt.getTime();
  const to = input.removedAt?.getTime() ?? Number.POSITIVE_INFINITY;
  if (to <= from) {
    return {
      at: "meter",
      message: "A meter's removal has to come after its installation.",
    };
  }
  const hits = (stays: readonly Installation[]) =>
    stays.some((s) => {
      if (s.id === input.ignoreId) return false;
      const sFrom = s.installedAt.getTime();
      const sTo = s.removedAt?.getTime() ?? Number.POSITIVE_INFINITY;
      // Half-open, so touching endpoints do NOT overlap — which is what makes
      // a same-instant exchange legal.
      return sFrom < to && from < sTo;
    });

  if (hits(input.meterStays)) {
    return {
      at: "meter",
      message:
        "This meter is already recorded as installed somewhere over that period. Record its removal from the other circuit first — a meter is in one place at a time.",
    };
  }
  if (hits(input.circuitStays)) {
    return {
      at: "circuit",
      message:
        "Another meter is already recorded on this circuit over that period. A circuit is measured by one meter at a time, because its billed figure has to trace to one source.",
    };
  }
  return null;
}

export type DaySlice = {
  /** UTC midnight of the day. */
  day: Date;
  installation: Installation | null;
};

/**
 * Split a meter's days by the stay each falls in.
 *
 * This is what stops one society's history being attributed to another when a
 * meter is reused. A day is judged at its own midnight: a stay that opens
 * mid-day takes the whole of that day, which matches how the readings are
 * stored (one row per calendar day) and how the exchange rule reads — the
 * outgoing meter's last day and the incoming meter's first are the same date.
 */
export function sliceDaysByInstallation(
  days: readonly Date[],
  installations: readonly Installation[],
): DaySlice[] {
  return days.map((day) => ({ day, installation: installationAt(installations, day) }));
}

/** Days with no covering stay — reported, never silently dropped. */
export function unattributedDays(slices: readonly DaySlice[]): Date[] {
  return slices.filter((s) => s.installation === null).map((s) => s.day);
}

// ── Assigning a span of a meter's readings (2026-09-26) ─────────────────────
//
// On a meter's readings page an operator selects a span and assigns it to a
// circuit. Meter data systems never assign readings directly — the install
// record is corrected and the readings follow it by date — so a span assign
// IS a history edit: the new stay is written, and any stay it overlaps (this
// meter's, or another meter's on the target circuit) is trimmed or split so
// nothing overlaps. The screen shows exactly this plan before anything moves.

export type StayRef = Installation & { meterId: string };

export type SpanChange =
  | { kind: "delete"; stay: StayRef }
  | { kind: "trim-end"; stay: StayRef; removedAt: Date }
  | { kind: "trim-start"; stay: StayRef; installedAt: Date }
  | { kind: "split"; stay: StayRef; removedAt: Date; tailFrom: Date };

export type SpanPlan = {
  changes: SpanChange[];
  create: { meterId: string; circuitId: string; installedAt: Date; removedAt: Date | null };
};

const end = (s: { removedAt: Date | null }) => s.removedAt?.getTime() ?? Number.POSITIVE_INFINITY;

/**
 * Plan a span assignment. `stays` is every stay of this meter AND every stay
 * on the target circuit (either may overlap). Pure; the caller refuses the
 * plan if a moved day is on a released bill or under a locked demo.
 */
export function planSpanAssignment(input: {
  meterId: string;
  circuitId: string;
  from: Date;
  /** Exclusive end; null = still there. */
  to: Date | null;
  stays: readonly StayRef[];
}): SpanPlan | { error: string } {
  const f = input.from.getTime();
  const t = input.to?.getTime() ?? Number.POSITIVE_INFINITY;
  if (t <= f) return { error: "The span has to end after it starts." };
  const changes: SpanChange[] = [];
  const seen = new Set<string>();
  for (const s of input.stays) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    const relevant = s.meterId === input.meterId || s.circuitId === input.circuitId;
    if (!relevant) continue;
    const a = s.installedAt.getTime();
    const b = end(s);
    if (!(a < t && f < b)) continue; // no overlap (half-open)
    if (f <= a && b <= t) changes.push({ kind: "delete", stay: s });
    else if (a < f && b > t) changes.push({ kind: "split", stay: s, removedAt: new Date(f), tailFrom: new Date(t) });
    else if (a < f) changes.push({ kind: "trim-end", stay: s, removedAt: new Date(f) });
    else changes.push({ kind: "trim-start", stay: s, installedAt: new Date(t) });
  }
  return {
    changes,
    create: { meterId: input.meterId, circuitId: input.circuitId, installedAt: input.from, removedAt: input.to },
  };
}

/** Days a plan moves away from where they were attributed — for the preview and the blockers. */
export function movedRanges(plan: SpanPlan): Array<{ stay: StayRef; from: Date; to: Date | null }> {
  const out: Array<{ stay: StayRef; from: Date; to: Date | null }> = [];
  const f = plan.create.installedAt;
  const t = plan.create.removedAt;
  for (const c of plan.changes) {
    const s = c.stay;
    const from = new Date(Math.max(s.installedAt.getTime(), f.getTime()));
    const toMs = Math.min(end(s), t?.getTime() ?? Number.POSITIVE_INFINITY);
    out.push({ stay: s, from, to: Number.isFinite(toMs) ? new Date(toMs) : null });
  }
  return out;
}

/** Midnight UTC of a date — every stay boundary is a whole day. */
export function toUtcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
