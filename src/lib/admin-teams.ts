// Which part of FirsThing an internal account belongs to, and what that lets
// it be handed.
//
// These are the blueprint's personas (02-users-research.md §1) made explicit
// on the account, not a new vocabulary. The team answers a question
// AdminPermission never did: permissions say what an account may DO, the team
// says what work may be ASSIGNED to it and whose behalf it may act on. Both
// are checked — a lead owner needs `manage_pipeline` AND a team that owns
// leads.

import type { AdminPermission, AdminTeam } from "@prisma/client";

export type TeamMeta = {
  id: AdminTeam;
  label: string;
  persona: string;
  /** One line, for the account form. */
  scope: string;
};

export const TEAMS: TeamMeta[] = [
  {
    id: "operations",
    label: "Operations / Admin",
    persona: "PER-01",
    scope: "Runs the whole back office. Can be assigned anything and can act on anyone's behalf.",
  },
  {
    id: "sales",
    label: "Sales / Marketing",
    persona: "PER-07",
    scope: "Owns leads and the deal up to the agreement.",
  },
  {
    id: "engineering",
    label: "Engineering / Commissioning",
    persona: "PER-04",
    scope: "Owns the survey, the demo installation and commissioning.",
  },
  {
    id: "inspection",
    label: "Field inspection",
    persona: "PER-03",
    scope: "Owns site inspections and field visits.",
  },
  {
    id: "support",
    label: "Customer support",
    persona: "PER-02",
    scope: "Handles society queries. Not assignable work of its own yet.",
  },
  {
    id: "finance",
    label: "Finance / Accounts",
    persona: "PER-08",
    scope: "Releases billing (CON-33). Deliberately separate from the team that runs the month.",
  },
];

/**
 * What each team's work actually requires.
 *
 * The account form listed five permissions as bare nouns with nothing tying
 * them to the team just chosen — "permission type not available for marketing
 * team" (user-reported 2026-08-24), looking at a Sales / Marketing account
 * and five checkboxes none of which says "marketing". They are not missing;
 * the one that matters is `manage_pipeline`, and nothing said so. This map is
 * what the form now preselects and explains.
 *
 * It is guidance, not a gate: operations holds everything by design, and a
 * real deployment may grant more. What it must never do is leave someone
 * guessing which box makes the account able to do its own job — a sales
 * account without `manage_pipeline` cannot own a lead, and the only symptom
 * is that it never appears in the owner picker.
 */
export const TEAM_PERMISSIONS: Record<AdminTeam, AdminPermission[]> = {
  operations: ["manage_users", "manage_pipeline", "manage_survey"],
  sales: ["manage_pipeline"],
  engineering: ["manage_survey"],
  inspection: ["manage_survey"],
  // Society queries — no assignable work of its own yet, so no permission
  // would be honest rather than a placeholder grant.
  support: [],
  // CON-33: deliberately the ONLY thing finance holds. An account that can
  // run a month must not be able to release its own output.
  finance: ["release_billing"],
};

/** The permissions this team needs that the given selection is missing. */
export function missingTeamPermissions(
  team: AdminTeam,
  granted: AdminPermission[],
): AdminPermission[] {
  return TEAM_PERMISSIONS[team].filter((p) => !granted.includes(p));
}

export function teamMeta(id: AdminTeam): TeamMeta {
  const found = TEAMS.find((t) => t.id === id);
  if (!found) throw new Error(`Unknown admin team: ${id}`);
  return found;
}

/**
 * The kinds of work that get handed to a named person. Deliberately a small
 * closed set — a new kind is a decision, not a string someone passes in.
 */
export type WorkKind = "lead" | "survey" | "inspection";

const OWNERS: Record<WorkKind, AdminTeam[]> = {
  // "This belongs to either admin or marketing team" — the user, 2026-08-24.
  lead: ["operations", "sales"],
  // "the inspection and demo belongs to engineer and inspector"
  survey: ["operations", "engineering", "inspection"],
  inspection: ["operations", "inspection", "engineering"],
};

/** Whether an account's team makes it eligible to be handed this work. */
export function canOwn(team: AdminTeam, kind: WorkKind): boolean {
  return OWNERS[kind].includes(team);
}

export function teamsFor(kind: WorkKind): AdminTeam[] {
  return OWNERS[kind];
}

/** Operations is the team that is never blocked — PER-01 is the ops lead. */
export function isOperations(team: AdminTeam): boolean {
  return team === "operations";
}

export type ActorRelation = {
  actorId: string;
  actorTeam: AdminTeam;
  /** Who the record is assigned to. */
  ownerId: string | null;
  /** Who created it, possibly on the owner's behalf. */
  creatorId: string | null;
};

export type ActRight =
  | { allowed: true; onBehalf: boolean; reason: string }
  | { allowed: false; reason: string };

/**
 * May this actor update a record that belongs to someone else?
 *
 * Three ways in, and the ORDER matters only for the message:
 *  · it is theirs — no caveat;
 *  · they created it for someone else — they may still update it, and it is
 *    on that person's behalf;
 *  · they are operations — "admin should have access to everything. they
 *    cant be blocked" (the user, 2026-08-24).
 *
 * Everyone else is refused. Acting on someone's behalf is allowed but never
 * silent: `onBehalf` is what makes the screen warn and the control confirm,
 * because the assignee is the one who was at the meeting.
 */
export function mayAct(rel: ActorRelation): ActRight {
  if (rel.ownerId && rel.actorId === rel.ownerId) {
    return { allowed: true, onBehalf: false, reason: "It is assigned to you." };
  }
  if (rel.creatorId && rel.actorId === rel.creatorId) {
    return {
      allowed: true,
      onBehalf: true,
      reason: "You logged this record on someone else's behalf.",
    };
  }
  if (isOperations(rel.actorTeam)) {
    return {
      allowed: true,
      onBehalf: true,
      reason: "Operations can act on any record.",
    };
  }
  return {
    allowed: false,
    reason: "This is assigned to someone else, and you did not create it.",
  };
}


// ── Whose turn is it? ─────────────────────────────────────────────────────

/** The teams that actually do each kind of step. */
const STEP_TEAMS: Record<"sales" | "field" | "ops", AdminTeam[]> = {
  sales: ["sales", "operations"],
  field: ["engineering", "inspection", "operations"],
  ops: ["operations"],
};

export type TurnVerdict =
  | { mine: true }
  | { mine: false; waitingOn: string; canOverride: boolean; note: string };

/**
 * Whether the next step belongs to the account looking at it.
 *
 * A deal is not one person's job. Showing every step as a blue "next step ·
 * Continue" told a sales account that running the site survey was their task
 * (user-reported 2026-08-24) — it is the field team's. Operations is never
 * blocked, but it is told whose work it is stepping into, which is the same
 * rule as `mayAct`.
 *
 * `society` steps are nobody internal's turn at all: the office-bearer acts
 * in their own portal and no admin can do it for them.
 */
export function whoseTurn(input: {
  owner: "sales" | "field" | "ops" | "society";
  actorTeam: AdminTeam;
  /** The named assignee for this kind of work, when there is one. */
  assigneeName: string | null;
}): TurnVerdict {
  if (input.owner === "society") {
    return {
      mine: false,
      waitingOn: "the society",
      canOverride: false,
      note: "The office-bearer does this in their own portal — it cannot be done for them from here.",
    };
  }
  if (STEP_TEAMS[input.owner].includes(input.actorTeam)) return { mine: true };

  const who =
    input.assigneeName ??
    (input.owner === "field"
      ? "the field team"
      : input.owner === "sales"
        ? "the sales owner"
        : "operations");
  return {
    mine: false,
    waitingOn: who,
    // Operations is never blocked — but it is told it is stepping in.
    canOverride: isOperations(input.actorTeam),
    note: isOperations(input.actorTeam)
      ? `This is ${who}'s step. You can record it for them, but only if the work has actually been done.`
      : `${who} does this. It is here so you can see where the deal is, not for you to record.`,
  };
}
