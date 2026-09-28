/**
 * Date change requests — maker–checker for recorded dates after go-live
 * (2026-09-28; docs/research/research_notes/Society lifecycle timeline design/
 * change_request_approval.md).
 *
 * The live value stays in force while a request is open (SAP MDG's staging
 * area; the request row is the staging copy). A different admin decides it.
 * At approval the value the requester SAW is compared with the value on the
 * record now: if the date moved underneath the request, it is closed as
 * superseded rather than applied over a change nobody reviewed (GitHub's
 * "dismiss stale approvals", for one field).
 *
 * Pure — the actions in src/app/admin/societies/[id]/timeline/actions.ts are
 * the db and logging shell around these.
 */

export type RequestStatus = "pending" | "approved" | "rejected" | "withdrawn" | "superseded";

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  pending: "Waiting for an admin",
  approved: "Accepted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  superseded: "Closed — the date changed",
};

/** Raising: a reason, a real change, and one open request per date. */
export function refuseRaise(i: {
  reason: string;
  fromValue: string | null;
  toValue: string;
  /** The open request already on this date, if any. */
  open: { requestedByName: string; toLabel: string } | null;
  /** The field is not correctable once live (e.g. the proposal decision). */
  liveApplicable: boolean;
}): string | null {
  if (!i.liveApplicable) return "This date is corrected only before go-live. Ask an operations lead how to proceed.";
  if (i.open) return `A change to this date is already waiting (${i.open.requestedByName}, to ${i.open.toLabel}). Withdraw it or wait for the decision first.`;
  if (!i.reason.trim()) return "Say why the date should change — the approver reads it, and it is kept with the old date.";
  if (i.fromValue === i.toValue) return "That is the date already on record.";
  return null;
}

export type ApprovalDecision =
  | { action: "refuse"; message: string; log: string }
  | { action: "supersede"; message: string }
  | { action: "apply" };

/**
 * Accepting. No self-approval — refused at the decision, not just hidden from
 * the list (Jira Service Management's rule), because a hidden button proves
 * nothing about the server.
 */
export function decideApproval(i: {
  status: RequestStatus;
  requesterId: string;
  approverId: string;
  canApprove: boolean;
  fromValue: string | null;
  currentValue: string | null;
}): ApprovalDecision {
  if (!i.canApprove) return { action: "refuse", message: "Accepting a date change needs the “Approve date changes” permission.", log: "no_permission" };
  if (i.status !== "pending") return { action: "refuse", message: "This request has already been decided.", log: "not_pending" };
  if (i.requesterId === i.approverId) return { action: "refuse", message: "You raised this request, so another admin decides it.", log: "self_approval" };
  if (i.fromValue !== i.currentValue) {
    return { action: "supersede", message: "The recorded date changed after this was asked, so it can no longer be applied. It has been closed; raise a new request if it is still wrong." };
  }
  return { action: "apply" };
}

export function refuseRejection(i: { status: RequestStatus; requesterId: string; approverId: string; canApprove: boolean; note: string }): string | null {
  if (!i.canApprove) return "Rejecting a date change needs the “Approve date changes” permission.";
  if (i.status !== "pending") return "This request has already been decided.";
  if (i.requesterId === i.approverId) return "You raised this request — withdraw it instead.";
  if (!i.note.trim()) return "Say why it is rejected — the requester reads it.";
  return null;
}

export function refuseWithdrawal(i: { status: RequestStatus; requesterId: string; actorId: string }): string | null {
  if (i.status !== "pending") return "This request has already been decided.";
  if (i.requesterId !== i.actorId) return "Only the person who raised a request can withdraw it.";
  return null;
}

/** The reason a correction action stores when it applies an accepted request. */
export function appliedReason(requestId: string, reason: string, approverName: string): string {
  return `Change request ${requestId}, accepted by ${approverName}: ${reason.trim()}`;
}
