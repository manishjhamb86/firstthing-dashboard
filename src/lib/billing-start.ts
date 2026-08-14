// FEAT-037 / CON-22 — "billing starts the day after the full-installation
// completion certificate is signed; the first month is billed pro-rata for
// the actual remaining days in that calendar month, not a full month."
//
// Two off-by-ones live in one sentence, and both cost real money in opposite
// directions, so each is a named function with its own test rather than an
// inline `+1` somewhere in a Server Action:
//
//   · billing starts the day *after* signing, not on the signing day;
//   · the first month covers the *actual remaining days* of that calendar
//     month, so it is neither a full month nor deferred to the next one.
//
// All arithmetic is done in UTC. Every date this codebase stores for a
// calendar day is stored at UTC midnight (the convention CommissioningReading
// established), and a local-time `getDate()` would silently shift a
// month-boundary signature into the wrong month for anyone east of UTC —
// which is everyone this product serves.

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function daysInMonthOf(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/**
 * CON-22's first rule: the day after the signature date.
 *
 * A certificate signed on the last day of a month therefore starts billing on
 * the 1st of the next — the proration below is a full month in that case, and
 * that is correct rather than a special case to code around.
 */
export function billingStartFor(signedAt: Date): Date {
  const day = utcMidnight(signedAt);
  return new Date(day.getTime() + 24 * 60 * 60 * 1000);
}

export type Proration = {
  billingStart: Date;
  /** Days actually billed in that first calendar month, inclusive of the start day. */
  proratedDays: number;
  daysInMonth: number;
  /** proratedDays / daysInMonth — never rounded; it multiplies a rupee figure. */
  fraction: number;
};

/**
 * CON-22's second rule. Inclusive of the billing start day itself: billing
 * starting on the 21st of a 31-day month covers 21–31, which is 11 days, not
 * 10. That is the arithmetic SCR-064's own copy states to the society before
 * they sign ("covers 21–31 August, 11 days"), so it is the arithmetic the
 * first invoice has to agree with.
 */
export function prorateFirstMonth(signedAt: Date): Proration {
  const billingStart = billingStartFor(signedAt);
  const daysInMonth = daysInMonthOf(billingStart);
  const proratedDays = daysInMonth - billingStart.getUTCDate() + 1;
  return { billingStart, proratedDays, daysInMonth, fraction: proratedDays / daysInMonth };
}

/**
 * FEAT-051-AC-5 — the contract's other end.
 *
 * "One mechanism, both ends of the contract": a mid-month termination
 * prorates by the days actually served, against that same calendar month's
 * own denominator. The final day is billed (the service was provided that
 * day), which is why this is inclusive of `endsOn` — the mirror of
 * `prorateFirstMonth` being inclusive of its start day, and the same
 * off-by-one waiting in the same place.
 */
export function prorateFinalMonth(endsOn: Date): Proration {
  const day = utcMidnight(endsOn);
  const daysInMonth = daysInMonthOf(day);
  return {
    billingStart: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1)),
    proratedDays: day.getUTCDate(),
    daysInMonth,
    fraction: day.getUTCDate() / daysInMonth,
  };
}

/**
 * The rupee estimate the society is shown before signing. Deliberately takes
 * the *monthly* fee and applies the fraction, rather than recomputing a fee
 * from daily figures — so this can never disagree with the monthly number on
 * the offer they accepted.
 *
 * Not rounded here (INV-02): rounding is a presentation decision, and the
 * invoice engine (FEAT-048, MS-08) is what owns it.
 */
export function proratedFirstInvoice(monthlyFee: number, proration: Proration): number {
  return monthlyFee * proration.fraction;
}
