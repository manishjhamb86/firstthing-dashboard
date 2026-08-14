// GATE-04 for offer acceptance (FEAT-108-AC-1), as a pure function for the
// same reason portal-authority.ts is one: auth() only works inside a live
// request context, so the actual authorization decision is factored out here
// and unit-tested, and the Server Action is a thin shell.

export type OfferViewer = {
  id: string;
  role: string;
  societyId: string | null;
};

export type OfferTarget = {
  id: string;
  status: string;
  pipelineSocietyId: string;
} | null;

export type OfferResponseRefusal =
  | "not-signed-in"
  | "not-office-bearer"
  | "offer-not-found"
  | "wrong-society"
  | "not-issued";

export const OFFER_RESPONSE_MESSAGE: Record<OfferResponseRefusal, string> = {
  "not-signed-in": "Your session is no longer valid — please sign in again.",
  // FEAT-108-AC-2 — the screen names who can perform it, and so does the
  // refusal: "unavailable" with no explanation is how a committee member
  // ends up believing the system is broken.
  "not-office-bearer": "Only the society's office-bearer can accept or reject an offer on its behalf.",
  "offer-not-found": "That offer no longer exists.",
  // INV-05 — a portal account can only ever act on its own society's data.
  "wrong-society": "That offer belongs to a different society.",
  "not-issued": "This offer isn't open for a response.",
};

export function checkOfferResponse(
  viewer: OfferViewer | null,
  offer: OfferTarget,
): { ok: true } | { ok: false; reason: OfferResponseRefusal; error: string } {
  const refuse = (reason: OfferResponseRefusal) =>
    ({ ok: false as const, reason, error: OFFER_RESPONSE_MESSAGE[reason] });

  if (!viewer || !viewer.societyId) return refuse("not-signed-in");
  if (viewer.role !== "office_bearer") return refuse("not-office-bearer");
  if (!offer) return refuse("offer-not-found");
  if (offer.pipelineSocietyId !== viewer.societyId) return refuse("wrong-society");
  if (offer.status !== "issued") return refuse("not-issued");

  return { ok: true };
}
