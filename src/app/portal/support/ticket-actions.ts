"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { hasGrant } from "@/lib/portal-access";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import type { TicketStatus, TicketType } from "@prisma/client";

/**
 * The society's own request desk (customer portal, 2026-08-29).
 *
 * Both actions resolve the actor from the Profile ROW (grants included) and
 * re-check tickets_manage — the raise cards not rendering for a viewer
 * without the grant is a courtesy, these checks are the boundary. Every
 * refusal returns a typed error (never throws — a thrown Server Action is an
 * opaque digest in production, this repo's repeatedly-paid-for lesson) and
 * logs its own line, because a refusal with no log line cannot be verified.
 */

const TYPES: TicketType[] = ["complaint", "device_replacement", "pickup"];
const STATUSES: TicketStatus[] = ["open", "in_progress", "resolved"];

export async function createTicket(formData: FormData): Promise<{ ok: true } | { error: string }> {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) return { error: "Your session has expired — sign in again." };
  if (!hasGrant(viewer, "tickets_manage")) {
    logger.warn("portal.ticket_refused", { actorId: viewer.id, reason: "no_manage_grant", act: "create" });
    return { error: "Raising requests needs the tickets access — ask your office-bearer." };
  }

  const type = String(formData.get("type") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const detail = String(formData.get("detail") ?? "").trim();
  if (!(TYPES as string[]).includes(type)) return { error: "Pick what kind of request this is." };
  if (!subject) return { error: "Give the request a one-line subject." };
  if (!detail) return { error: "Describe the problem so the team arrives knowing what to look for." };

  const ticket = await db.ticket.create({
    data: {
      societyId: viewer.societyId,
      type: type as TicketType,
      subject,
      detail,
      raisedById: viewer.id,
    },
  });
  logger.info("portal.ticket_raised", {
    ticketId: ticket.id,
    societyId: viewer.societyId,
    actorId: viewer.id,
    type,
  });
  revalidatePath("/portal/support");
  return { ok: true };
}

export async function setTicketStatus(
  ticketId: string,
  status: string,
  note?: string,
): Promise<{ ok: true } | { error: string }> {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) return { error: "Your session has expired — sign in again." };
  if (!hasGrant(viewer, "tickets_manage")) {
    logger.warn("portal.ticket_refused", { actorId: viewer.id, reason: "no_manage_grant", act: "status" });
    return { error: "Updating requests needs the tickets access — ask your office-bearer." };
  }
  if (!(STATUSES as string[]).includes(status)) return { error: "That is not a ticket status." };

  // INV-05 — the ticket must belong to the viewer's own society, whatever id
  // the request carries.
  const ticket = await db.ticket.findFirst({
    where: { id: ticketId, societyId: viewer.societyId },
    select: { id: true, status: true },
  });
  if (!ticket) {
    logger.warn("portal.ticket_refused", { actorId: viewer.id, reason: "not_own_society", ticketId });
    return { error: "That request does not belong to your society." };
  }

  const trimmed = (note ?? "").trim();
  if (status === "resolved" && !trimmed) {
    // A closed ticket with no stated outcome is indistinguishable from one
    // closed to tidy the list.
    return { error: "Say how it was resolved — the note stays on the record." };
  }

  await db.ticket.update({
    where: { id: ticket.id },
    data: {
      status: status as TicketStatus,
      lastStatusById: viewer.id,
      ...(status === "resolved"
        ? { resolvedAt: new Date(), resolutionNote: trimmed }
        : { resolvedAt: null, resolutionNote: null }),
    },
  });
  logger.info("portal.ticket_status", {
    ticketId: ticket.id,
    actorId: viewer.id,
    from: ticket.status,
    to: status,
  });
  revalidatePath("/portal/support");
  return { ok: true };
}
