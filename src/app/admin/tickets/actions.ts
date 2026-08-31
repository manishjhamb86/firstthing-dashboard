"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveAdmin } from "@/lib/admin-permissions";
import type { TicketStatus } from "@prisma/client";

/**
 * FirsThing's side of the request desk (customer portal, 2026-08-31).
 *
 * Gated to manage_users — the society-facing permission family (portal
 * accounts, tank assignment) — because acting on a society's request is
 * society management, not survey or pipeline work. Resolved from the row,
 * typed errors, a log line per outcome: the standing action shape.
 */
const STATUSES: TicketStatus[] = ["open", "in_progress", "resolved"];

export async function adminSetTicketStatus(
  ticketId: string,
  status: string,
  note?: string,
): Promise<{ ok: true } | { error: string }> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  if (!admin.permissions.includes("manage_users")) {
    logger.warn("admin.ticket_refused", { actorId: admin.id, ticketId, reason: "permission" });
    return { error: "Acting on society requests is a society-management action (Manage users)." };
  }
  if (!(STATUSES as string[]).includes(status)) return { error: "That is not a ticket status." };

  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, status: true, societyId: true },
  });
  if (!ticket) return { error: "That request no longer exists." };

  const trimmed = (note ?? "").trim();
  if (status === "resolved" && !trimmed) {
    // Same rule as the portal's own resolve: a closed ticket with no stated
    // outcome is indistinguishable from one closed to tidy a list — and here
    // the note is also what the SOCIETY reads as the answer to its request.
    return { error: "Say how it was resolved — the society reads this note." };
  }

  await db.ticket.update({
    where: { id: ticket.id },
    data: {
      status: status as TicketStatus,
      lastStatusByAdminId: admin.id,
      lastStatusById: null,
      ...(status === "resolved"
        ? { resolvedAt: new Date(), resolutionNote: trimmed }
        : { resolvedAt: null, resolutionNote: null }),
    },
  });
  logger.info("admin.ticket_status", {
    ticketId: ticket.id,
    societyId: ticket.societyId,
    actorId: admin.id,
    from: ticket.status,
    to: status,
  });
  revalidatePath("/admin/tickets");
  revalidatePath("/portal/support");
  return { ok: true };
}
