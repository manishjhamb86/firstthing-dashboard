import { formatDate } from "@/lib/format-date";
import { encodeValue, parseValue, TIMELINE_FIELDS, type TimelineField } from "@/lib/timeline-fields";

/**
 * One society's whole chronology, checked as one object (2026-09-28).
 *
 * Every ordering rule in this product used to guard a single action, so a
 * date could be legal when it was entered and wrong in the context of the
 * whole lifecycle — nothing ever looked at the chain. This module is the
 * declared rule table the research asked for (docs/research/reports/Society
 * lifecycle timeline design.md): each rule is "this step on or after that
 * one", checked at day precision by one function over a snapshot, so the
 * timeline page, a direct edit and a change request all read the same rules
 * in the same words.
 *
 * Pure — no db. The loader (society-timeline-loader.ts) builds the tree.
 */

export type BranchKind = "society" | "line" | "deal" | "circuit" | "demo" | "billing";

export type EditRef = { field: TimelineField; entityId: string };

export type ChainItem = { slot: string; label: string; date: Date | null; edit?: EditRef | null };

export type Step = {
  /** Unique across the tree: `${branchId}:${slot}`. */
  id: string;
  /** What rules call this step, looked up in its branch then its ancestors. */
  slot: string;
  /** Past tense: "Lead logged", "Lights replaced". */
  label: string;
  date: Date | null;
  /** The end of a period (readings, a contract term). */
  end?: Date | null;
  /** A booked step or a term end: a future date is expected, not an error. */
  futureOk?: boolean;
  /** Missing while a later step has a date means it happened unrecorded. */
  expected?: boolean;
  /**
   * The date is when the record was typed in, not when the thing happened
   * (record time, not actual time). Shown with that note, never checked:
   * "entered three months later" is provenance, not an error.
   */
  recordOnly?: string | null;
  /** The date is taken from another record — shown with "≈" and this note. */
  borrowed?: string | null;
  note?: string | null;
  chip?: { text: string; tone: "ok" | "warn" | "bad" | "info" | "neu" } | null;
  /** Dated sub-steps that read as one row: the agreement's prepared → uploaded. */
  chain?: ChainItem[];
  edit?: EditRef | null;
};

export type Branch = {
  id: string;
  kind: BranchKind;
  /** "Service line", "Deal", "Circuit", "Demo 1". */
  title: string;
  name: string;
  meta?: string | null;
  /** Closed lost, rejected, removed — listed struck through, with the reason. */
  struck?: string | null;
  steps: Step[];
  children: Branch[];
  /** Steps that follow the children: a deal continues after its circuits. */
  after?: Step[];
};

export type Severity = "error" | "warning" | "info";
export type IssueKind = "order" | "check" | "future" | "missing" | "borrowed";

export type Issue = {
  stepId: string;
  kind: IssueKind;
  severity: Severity;
  message: string;
  /** Stable identity, so a proposed change can be judged on what it adds. */
  key: string;
};

// ── The rule table ─────────────────────────────────────────────────────────
//
// `later` must fall on or after `earlier` (strictly after when `strict`).
// A reference is a slot, or `slot.end` for the end of a period. Rules are
// declared on the branch kind whose steps they read; a slot not in that
// branch is looked up through its ancestors — so a demo's meter is checked
// against its deal's survey, but a parallel track (a second deal, a second
// demo) is never compared with its sibling, only with its parent.
//
// `error` rules are the ones the correction actions already enforce;
// `warning` rules are the gaps the research found, which ship as "Check"
// until stage data is clean (GitHub's Evaluate-before-Active idea). `flag`
// says which of the two rows carries the message.

export type Rule = {
  id: string;
  scope: BranchKind;
  later: string;
  earlier: string;
  strict?: boolean;
  severity: "error" | "warning";
  flag?: "later" | "earlier";
  /** The rule in words, appended to the two dates. */
  words: string;
};

const AGREEMENT_CHAIN = ["agreementPrepared", "agreementPrinted", "agreementNotarized", "agreementSigned", "agreementUploaded"];

export const CHRONOLOGY_RULES: Rule[] = [
  // Service line
  { id: "line.enrolled-first-lead", scope: "deal", later: "lead", earlier: "enrolled", severity: "warning", flag: "earlier", words: "A service line is enrolled on or before its first lead." },

  // Deal, up to the survey
  { id: "deal.decided-meeting", scope: "deal", later: "decided", earlier: "meeting", severity: "error", words: "The proposal is decided on or after the demo meeting." },
  { id: "deal.decided-lead", scope: "deal", later: "decided", earlier: "lead", severity: "error", words: "The proposal is decided on or after the lead is logged." },
  { id: "deal.survey-assigned-decided", scope: "deal", later: "surveyAssigned", earlier: "decided", severity: "warning", words: "The survey is assigned once the proposal is agreed." },
  { id: "deal.survey-lead", scope: "deal", later: "survey", earlier: "lead", severity: "error", words: "The survey happens on or after the lead is logged." },
  { id: "deal.survey-decided", scope: "deal", later: "survey", earlier: "decided", severity: "error", words: "The survey happens on or after the proposal is decided." },

  // Demo (reads its deal's survey and decision through the tree)
  { id: "demo.meter-survey", scope: "demo", later: "meter", earlier: "survey", severity: "error", words: "The meter goes in on or after the survey." },
  { id: "demo.meter-decided", scope: "demo", later: "meter", earlier: "decided", severity: "error", words: "The meter goes in on or after the proposal is decided." },
  { id: "demo.pre-meter", scope: "demo", later: "pre", earlier: "meter", strict: true, severity: "error", words: "Before-installation readings start the day after the meter goes in." },
  { id: "demo.pre-range", scope: "demo", later: "pre.end", earlier: "pre", severity: "error", words: "A period ends on or after the day it starts." },
  { id: "demo.replaced-pre", scope: "demo", later: "replaced", earlier: "pre.end", strict: true, severity: "error", words: "The lights are replaced after the before-installation readings end." },
  { id: "demo.replaced-meter", scope: "demo", later: "replaced", earlier: "meter", strict: true, severity: "error", words: "The lights are replaced after the meter goes in." },
  { id: "demo.replaced-assigned", scope: "demo", later: "replaced", earlier: "replacementAssigned", severity: "error", flag: "earlier", words: "The crew is assigned on or before the day the lights are replaced." },
  { id: "demo.post-replaced", scope: "demo", later: "post", earlier: "replaced", strict: true, severity: "error", words: "After-installation readings start the day after the lights are replaced." },
  { id: "demo.post-range", scope: "demo", later: "post.end", earlier: "post", severity: "error", words: "A period ends on or after the day it starts." },

  // Offer and agreement
  { id: "deal.offer-meeting", scope: "deal", later: "offerIssued", earlier: "meeting", severity: "error", words: "An offer is issued on or after the demo meeting." },
  { id: "deal.responded-issued", scope: "deal", later: "offerResponded", earlier: "offerIssued", severity: "error", words: "An offer is answered on or after it is issued." },
  { id: "deal.prepared-responded", scope: "deal", later: "agreementPrepared", earlier: "offerResponded", severity: "error", words: "The agreement is prepared once the offer is accepted." },
  ...AGREEMENT_CHAIN.flatMap((later, i) =>
    AGREEMENT_CHAIN.slice(0, i).map<Rule>((earlier) => ({
      id: `deal.${later}-${earlier}`,
      scope: "deal",
      later,
      earlier,
      severity: "error",
      words: "The agreement is prepared, printed, notarised, signed and uploaded in that order.",
    })),
  ),
  { id: "deal.activated-signed", scope: "deal", later: "contractActivated", earlier: "agreementSigned", severity: "error", words: "The contract is activated on or after the agreement is signed." },
  { id: "deal.term-range", scope: "deal", later: "term.end", earlier: "term", strict: true, severity: "error", words: "A contract term ends after it starts." },
  { id: "deal.term-signed", scope: "deal", later: "term", earlier: "agreementSigned", severity: "warning", words: "A contract term starts on or after the agreement is signed." },

  // Installation
  { id: "deal.install-signed", scope: "deal", later: "installWork", earlier: "agreementSigned", severity: "warning", words: "Installation starts once the agreement is signed." },
  { id: "deal.certificate-work", scope: "deal", later: "certificate", earlier: "installWork.end", severity: "error", words: "The certificate is signed on or after the last day's work." },
  { id: "deal.certificate-signed", scope: "deal", later: "certificate", earlier: "agreementSigned", severity: "warning", words: "The installation certificate is signed after the agreement." },
  { id: "deal.terminated-term", scope: "deal", later: "terminated", earlier: "term", severity: "warning", words: "A contract ends on or after its term starts." },
];

// ── Checking ───────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const dayOf = (d: Date) => Math.floor(d.getTime() / DAY_MS);

type Found = { step: Step; date: Date | null; label: string; recordOnly: boolean };

function allSteps(b: Branch): Step[] {
  return [...b.steps, ...(b.after ?? [])];
}

/** Resolve a rule reference in a branch, then up its ancestors. */
function resolve(ref: string, path: Branch[]): Found | null {
  const [slot, edge] = ref.split(".");
  for (let i = path.length - 1; i >= 0; i--) {
    for (const step of allSteps(path[i])) {
      if (step.slot === slot) {
        const date = edge === "end" ? step.end ?? null : step.date;
        return { step, date, label: edge === "end" ? `the end of ${step.label.toLowerCase()}` : step.label, recordOnly: !!step.recordOnly };
      }
      for (const c of step.chain ?? []) {
        if (c.slot === slot) return { step, date: c.date, label: c.label, recordOnly: !!step.recordOnly };
      }
    }
  }
  return null;
}

function walk(b: Branch, path: Branch[], visit: (b: Branch, path: Branch[]) => void) {
  const here = [...path, b];
  visit(b, here);
  for (const c of b.children) walk(c, here, visit);
}

export function forEachStep(root: Branch, fn: (s: Step, b: Branch) => void) {
  walk(root, [], (b) => allSteps(b).forEach((s) => fn(s, b)));
}

/**
 * Every problem in the tree. Order rules first, then dates in the future,
 * then steps with no date that must have happened, then borrowed dates.
 */
export function checkSocietyChronology(root: Branch, today: Date, rules: Rule[] = CHRONOLOGY_RULES): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  const push = (i: Issue) => {
    if (seen.has(i.key)) return;
    seen.add(i.key);
    issues.push(i);
  };

  walk(root, [], (branch, path) => {
    if (branch.struck) return;
    for (const rule of rules) {
      if (rule.scope !== branch.kind) continue;
      const later = resolve(rule.later, path);
      const earlier = resolve(rule.earlier, path);
      if (!later?.date || !earlier?.date || later.recordOnly || earlier.recordOnly) continue;
      const a = dayOf(later.date);
      const b = dayOf(earlier.date);
      if (rule.strict ? a > b : a >= b) continue;
      const flagLater = (rule.flag ?? "later") === "later";
      const [mine, other] = flagLater ? [later, earlier] : [earlier, later];
      const relation = flagLater ? (a === b ? "the same day as" : "before") : a === b ? "the same day as" : "after";
      const subject = mine.label.charAt(0).toUpperCase() + mine.label.slice(1);
      push({
        stepId: mine.step.id,
        kind: rule.severity === "error" ? "order" : "check",
        severity: rule.severity,
        key: `${rule.id}:${mine.step.id}`,
        message: `${subject} on ${formatDate(mine.date)} is ${relation} ${other.label.toLowerCase()} on ${formatDate(other.date)}. ${rule.words}`,
      });
    }
  });

  const todayDay = dayOf(today);
  forEachStep(root, (s) => {
    if (s.futureOk || s.recordOnly) return;
    const dates: [string, Date | null | undefined][] = [
      [s.label, s.date],
      [`${s.label} (end)`, s.end],
      ...(s.chain ?? []).map((c): [string, Date | null] => [c.label, c.date]),
    ];
    for (const [label, d] of dates) {
      if (d && dayOf(d) > todayDay) {
        push({ stepId: s.id, kind: "future", severity: "error", key: `future:${s.id}:${label}`, message: `${label} is dated ${formatDate(d)}, in the future. A step that has happened is dated on or before today.` });
      }
    }
  });

  walk(root, [], (branch) => {
    if (branch.struck) return;
    const seq = allSteps(branch);
    seq.forEach((s, i) => {
      if (!s.expected || s.date) return;
      if (seq.slice(i + 1).some((t) => t.date && !t.recordOnly)) {
        push({ stepId: s.id, kind: "missing", severity: "warning", key: `missing:${s.id}`, message: `${s.label} has no date, but later steps do — so it happened. Record when.` });
      }
    });
  });

  forEachStep(root, (s) => {
    if (s.borrowed && s.date) {
      push({ stepId: s.id, kind: "borrowed", severity: "info", key: `borrowed:${s.id}`, message: s.borrowed });
    }
  });

  return issues;
}

export type ChronologySummary = {
  order: number;
  check: number;
  future: number;
  missing: number;
  borrowed: number;
  /** Dated, checked steps with nothing wrong. */
  inOrder: number;
  /** Expected steps not reached yet. */
  notReached: number;
};

export function summarise(root: Branch, issues: Issue[]): ChronologySummary {
  const flagged = new Set(issues.filter((i) => i.severity !== "info").map((i) => i.stepId));
  const count = (k: IssueKind) => issues.filter((i) => i.kind === k).length;
  let inOrder = 0;
  let notReached = 0;
  const missing = new Set(issues.filter((i) => i.kind === "missing").map((i) => i.stepId));
  forEachStep(root, (s) => {
    if (s.date && !s.recordOnly && !flagged.has(s.id)) inOrder++;
    if (!s.date && s.expected && !missing.has(s.id)) notReached++;
  });
  return { order: count("order"), check: count("check"), future: count("future"), missing: count("missing"), borrowed: count("borrowed"), inOrder, notReached };
}

/** "same day", "+14 days" — the quiet gap to the step before. */
export function gapLabel(prev: Date | null | undefined, date: Date | null | undefined): string | null {
  if (!prev || !date) return null;
  const n = dayOf(date) - dayOf(prev);
  if (n === 0) return "same day";
  if (n === 1) return "+1 day";
  if (n === -1) return "−1 day";
  return n > 0 ? `+${n} days` : `−${-n} days`;
}

/** "6 days" — how long a period runs, both ends counted. */
export function spanLabel(from: Date | null | undefined, to: Date | null | undefined): string | null {
  if (!from || !to) return null;
  const n = dayOf(to) - dayOf(from) + 1;
  return n === 1 ? "1 day" : `${n} days`;
}

// ── A proposed change ──────────────────────────────────────────────────────

/** The tree as it would be with one date changed. Null when nothing matches. */
export function withProposal(root: Branch, ref: EditRef, value: string): Branch | null {
  const parsed = parseValue(value, TIMELINE_FIELDS[ref.field].range);
  if (!parsed) return null;
  let hit = false;
  const same = (e: EditRef | null | undefined) => !!e && e.field === ref.field && e.entityId === ref.entityId;
  const mapStep = (s: Step): Step => {
    let next = s;
    if (same(s.edit)) {
      hit = true;
      next = { ...next, date: parsed.from, ...(parsed.to ? { end: parsed.to } : {}), borrowed: null };
    }
    if (s.chain?.some((c) => same(c.edit))) {
      hit = true;
      next = { ...next, chain: s.chain.map((c) => (same(c.edit) ? { ...c, date: parsed.from } : c)) };
    }
    return next;
  };
  const mapBranch = (b: Branch): Branch => ({
    ...b,
    steps: b.steps.map(mapStep),
    after: b.after?.map(mapStep),
    children: b.children.map(mapBranch),
  });
  const next = mapBranch(root);
  return hit ? next : null;
}

/** The value a step holds now for a field, in the stored value shape. */
export function currentValue(root: Branch, ref: EditRef): { found: boolean; value: string | null } {
  let out: { found: boolean; value: string | null } = { found: false, value: null };
  const range = TIMELINE_FIELDS[ref.field].range;
  forEachStep(root, (s) => {
    if (s.edit && s.edit.field === ref.field && s.edit.entityId === ref.entityId) {
      out = { found: true, value: range ? encodeValue(s.date, s.end ?? null) : encodeValue(s.date) };
    }
    for (const c of s.chain ?? []) {
      if (c.edit && c.edit.field === ref.field && c.edit.entityId === ref.entityId) out = { found: true, value: encodeValue(c.date) };
    }
  });
  return out;
}

/**
 * The errors a change would ADD. A correction is refused only when the result
 * is out of order in a new way — never because something else already was,
 * or the cleanup of one bad date could be blocked by another.
 */
export function refuseProposal(root: Branch, ref: EditRef, value: string, today: Date): string | null {
  const next = withProposal(root, ref, value);
  if (!next) return "That date is not on this society's timeline.";
  const before = new Set(checkSocietyChronology(root, today).map((i) => i.key));
  const added = checkSocietyChronology(next, today).filter((i) => i.severity === "error" && !before.has(i.key));
  return added[0]?.message ?? null;
}

/** The new rule warnings a change would add — shown, never refused. */
export function proposalWarnings(root: Branch, ref: EditRef, value: string, today: Date): string[] {
  const next = withProposal(root, ref, value);
  if (!next) return [];
  const before = new Set(checkSocietyChronology(root, today).map((i) => i.key));
  return checkSocietyChronology(next, today)
    .filter((i) => i.severity === "warning" && i.kind === "check" && !before.has(i.key))
    .map((i) => i.message);
}

/** Where a date sits: its row's label and the branch names above it. */
export function locate(root: Branch, ref: EditRef): { label: string; path: string[] } | null {
  let out: { label: string; path: string[] } | null = null;
  const same = (e: EditRef | null | undefined) => !!e && e.field === ref.field && e.entityId === ref.entityId;
  walk(root, [], (b, path) => {
    for (const s of allSteps(b)) {
      const chain = s.chain?.find((c) => same(c.edit));
      if (same(s.edit) || chain) {
        out = {
          label: chain ? `${s.label} — ${chain.label.toLowerCase()}` : s.label,
          path: path.slice(1).map((p) => (p.kind === "demo" ? `${p.title}` : p.name)),
        };
      }
    }
  });
  return out;
}
