// FEAT-035-AC-4 — who may approve a daily installation batch.
//
// This is deliberately *not* GATE-04. A binding act (accepting an offer,
// transferring the office-bearer designation) requires office-bearer
// authority; a batch approval requires being the **named onlooker** for that
// project, whichever of the three portal roles they happen to hold.
//
// The two rules point in different directions, and both are right. GATE-04
// protects acts that bind the society contractually, so it keys off standing
// authority. CON-21's gate protects a crew's next working day, so it keys off
// a named person who agreed to look at photos each evening — SCR-060 assigns
// the onlooker as a "society contact", and FEAT-033-AC-3 refuses to publish a
// plan without one precisely because the role is per-project, not inherent.
//
// Getting this backwards in either direction has a real cost: requiring
// office-bearer authority would hand a hard daily deadline to the one person
// least likely to be on site, and accepting any society account would mean
// the gate is satisfied by someone who never agreed to watch the work.

export type OnlookerViewer = { id: string; societyId: string | null };

export type BatchReviewRefusal =
  | "not-signed-in"
  | "batch-not-found"
  | "wrong-society"
  | "not-onlooker"
  | "not-awaiting-review";

export const BATCH_REVIEW_REFUSAL_MESSAGE: Record<BatchReviewRefusal, string> = {
  "not-signed-in": "Your session is no longer valid — please sign in again.",
  "batch-not-found": "That day's work could not be found.",
  "wrong-society": "That work belongs to another society.",
  "not-onlooker":
    "Only the onlooker named for this installation can approve or dispute a day's work. You can see everything that was done, but the approval has to come from them.",
  "not-awaiting-review": "That day has already been reviewed.",
};

export function checkBatchReview(
  viewer: OnlookerViewer | null,
  batch: { id: string; state: string; societyId: string; onlookerId: string } | null,
): { ok: true } | { ok: false; reason: BatchReviewRefusal; error: string } {
  const refuse = (reason: BatchReviewRefusal) =>
    ({ ok: false as const, reason, error: BATCH_REVIEW_REFUSAL_MESSAGE[reason] });

  if (!viewer) return refuse("not-signed-in");
  if (!batch) return refuse("batch-not-found");
  // INV-05 — checked before the onlooker test, so a foreign society's user is
  // told the work isn't theirs rather than being told who may approve it.
  if (!viewer.societyId || viewer.societyId !== batch.societyId) return refuse("wrong-society");
  if (viewer.id !== batch.onlookerId) return refuse("not-onlooker");
  if (batch.state !== "awaiting_review") return refuse("not-awaiting-review");
  return { ok: true };
}

/**
 * FEAT-035 / FLOW-07 step 3 — approving is one tap, disputing is not.
 *
 * A dispute stops work and has to be actionable by someone standing in the
 * building tomorrow, so it requires a photo and a location. Approving carries
 * a hard deadline behind it and friction there costs a crew a day, so it
 * requires nothing.
 */
export function refuseDispute(input: { evidencePhotoKeys: string[]; location: string; note: string }): string | null {
  if (input.evidencePhotoKeys.length === 0) {
    return "A dispute needs a photo. It stops tomorrow's work, and whoever comes to sort it out has to be able to see what you saw.";
  }
  if (!input.location.trim()) {
    return "Say where — which floor, wing or corridor. A dispute has to be findable.";
  }
  if (!input.note.trim()) {
    return "Say what is wrong, in a sentence.";
  }
  return null;
}
