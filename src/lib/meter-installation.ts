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
        "Another meter is already recorded on this circuit over that period. A circuit is measured by one meter at a time, because its billed figure has to trace to one source (CON-11, INV-02).",
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
