/**
 * Which meter did this export come from?
 *
 * A SONOFF hourly export carries no device identity whatsoever — its columns
 * are `data,time,consumption/KWh` and nothing else, and its filename is a
 * date range. So the meter is inferred by OVERLAP: the file's hours are
 * compared against the hours already stored for each meter, and a meter that
 * agrees on the overlap is proposed.
 *
 * The proposal is never applied on its own. Filing a month of readings
 * against the wrong meter puts one society's consumption into another's
 * monitoring, and unlike most mistakes here it looks entirely normal
 * afterwards. A person confirms, always.
 *
 * ---
 *
 * The trap this module is built around, found by measuring a real export
 * rather than by reasoning about it: **92% of that file's 4,536 hourly
 * values were exactly zero**, and its first non-zero reading was 174 days
 * in. A run of zeros is not evidence of anything — every idle meter agrees
 * with every other idle meter, perfectly, for as long as you like. So a
 * match is counted in DISTINCTIVE hours (both sides non-zero and equal), and
 * a comparison that turns up too few of those reports no evidence rather
 * than a confident wrong answer.
 */

/** One stored hour, keyed the way the file prints it. */
export type StoredHour = { dayKey: string; hour: number; kWh: number };

export type Candidate = {
  meterId: string;
  meterName: string;
  circuitLabel: string | null;
  societyName: string | null;
  stored: StoredHour[];
};

export type CandidateScore = {
  meterId: string;
  meterName: string;
  circuitLabel: string | null;
  societyName: string | null;
  /** Hours present in both the file and this meter's history. */
  overlapping: number;
  /** Of those, how many agree. */
  agreeing: number;
  /** Of those that agree, how many are non-zero — the ones that mean anything. */
  distinctive: number;
  /** Overlapping hours where the two disagree. This is what rules a meter out. */
  conflicting: number;
};

/**
 * How many non-zero hours have to agree before a match is proposed. Two
 * meters producing eight identical non-zero hourly readings to two decimal
 * places is not something that happens by accident; eight identical zeros is
 * something that happens every night.
 */
export const MIN_DISTINCTIVE_HOURS = 8;

/**
 * A single disagreement is allowed for — a superseded correction, a device
 * clock nudged — but a meter that disagrees on more than this is a different
 * meter, however much of the rest lines up.
 */
export const MAX_CONFLICT_RATE = 0.02;

/** Two readings of the same hour agree within this. */
export const AGREEMENT_TOLERANCE_KWH = 0.005;

export type MatchOutcome =
  | { kind: "confident"; best: CandidateScore; runnersUp: CandidateScore[] }
  | { kind: "ambiguous"; tied: CandidateScore[]; reason: string }
  | { kind: "no_evidence"; reason: string; scores: CandidateScore[] };

export function dayKeyOf(day: Date): string {
  return day.toISOString().slice(0, 10);
}

function keyOf(dayKey: string, hour: number): string {
  return `${dayKey}#${hour}`;
}

export function scoreCandidate(
  fileHours: Map<string, number>,
  candidate: Candidate,
): CandidateScore {
  let overlapping = 0;
  let agreeing = 0;
  let distinctive = 0;
  let conflicting = 0;

  for (const s of candidate.stored) {
    const fileValue = fileHours.get(keyOf(s.dayKey, s.hour));
    if (fileValue === undefined) continue;
    overlapping++;
    if (Math.abs(fileValue - s.kWh) <= AGREEMENT_TOLERANCE_KWH) {
      agreeing++;
      // A zero matching a zero tells you nothing: an idle meter agrees with
      // every other idle meter. Only a non-zero agreement is evidence.
      if (fileValue > 0) distinctive++;
    } else {
      conflicting++;
    }
  }
  return {
    meterId: candidate.meterId,
    meterName: candidate.meterName,
    circuitLabel: candidate.circuitLabel,
    societyName: candidate.societyName,
    overlapping,
    agreeing,
    distinctive,
    conflicting,
  };
}

function qualifies(s: CandidateScore): boolean {
  if (s.distinctive < MIN_DISTINCTIVE_HOURS) return false;
  if (s.overlapping === 0) return false;
  return s.conflicting / s.overlapping <= MAX_CONFLICT_RATE;
}

/**
 * Propose the meter this export came from, or say honestly that the file
 * carries no evidence either way.
 */
export function matchMeter(
  filePoints: { day: Date; hour: number; kWh: number }[],
  candidates: Candidate[],
): MatchOutcome {
  const fileHours = new Map<string, number>();
  for (const p of filePoints) fileHours.set(keyOf(dayKeyOf(p.day), p.hour), p.kWh);

  const scores = candidates
    .map((c) => scoreCandidate(fileHours, c))
    .sort((a, b) => b.distinctive - a.distinctive || a.conflicting - b.conflicting);

  const qualifying = scores.filter(qualifies);

  if (qualifying.length === 0) {
    const anyOverlap = scores.some((s) => s.overlapping > 0);
    return {
      kind: "no_evidence",
      scores,
      reason: anyOverlap
        ? `No meter agrees with this file on at least ${MIN_DISTINCTIVE_HOURS} hours that carry a reading. ` +
          `Overlapping hours that are all zero prove nothing — an idle meter matches every other idle meter. ` +
          `Choose the meter yourself.`
        : `None of these meters holds any hour this file also covers, so there is nothing to compare. ` +
          `That is expected for a meter's first import. Choose the meter yourself.`,
    };
  }
  if (qualifying.length > 1) {
    return {
      kind: "ambiguous",
      tied: qualifying,
      reason:
        `${qualifying.length} meters agree with this file on hours that carry a reading. ` +
        `That should not happen for genuinely different circuits — check whether one of them has ` +
        `already been imported from the wrong file. Choose the meter yourself.`,
    };
  }
  // The single qualifying candidate — NOT simply the top of the sort. A
  // meter can lead on distinctive hours and still be ruled out by conflicts,
  // and returning it as "best" would propose the one meter the evidence
  // excludes.
  const best = qualifying[0];
  const runnersUp = scores.filter((s) => s.meterId !== best.meterId).slice(0, 3);
  return { kind: "confident", best, runnersUp };
}
