// Which part of FirsThing an internal account belongs to, and what that lets
// it be handed.
//
// These are the blueprint's personas (02-users-research.md §1) made explicit
// on the account, not a new vocabulary. The team answers a question
// AdminPermission never did: permissions say what an account may DO, the team
// says what work may be ASSIGNED to it and whose behalf it may act on. Both
// are checked — a lead owner needs `manage_pipeline` AND a team that owns
// leads.

import type { AdminTeam } from "@prisma/client";

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
