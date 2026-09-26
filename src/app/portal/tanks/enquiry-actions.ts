"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { hasGrant } from "@/lib/portal-access";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { WATER_PLAN_LABEL, type WaterPlan } from "./water-plans";

/**
 * A society with no tanks connected asks FirsThing about its water and pump
 * system (2026-09-26, user-asked). It lands on the back office's request
 * desk as an enquiry, so operations sees it beside every other request and
 * in the notification bell. Any member who can see the water page may ask —
 * an enquiry binds the society to nothing.
 */
export async function requestWaterSurvey(input: {
  plan: string;
  phone: string;
  note: string;
}): Promise<{ ok: true } | { error: string }> {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) return { error: "Your session has expired — sign in again." };
  if (!hasGrant(viewer, "water_tanks")) {
    logger.warn("portal.water_enquiry_refused", { actorId: viewer.id, reason: "no_grant" });
    return { error: "Only members who can see the water page can send this request." };
  }
  if (!(input.plan in WATER_PLAN_LABEL)) return { error: "Pick which option you'd like to hear about." };
  const phone = input.phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  if (!/^[6-9]\d{9}$/.test(phone)) return { error: "Give a 10-digit mobile number our team can call." };

  const open = await db.ticket.findFirst({
    where: { societyId: viewer.societyId, type: "enquiry", status: { not: "resolved" }, subject: { startsWith: "Water" } },
    select: { id: true },
  });
  if (open) return { error: "Your society's request is already with our team — they will be in touch." };

  const plan = input.plan as WaterPlan;
  const ticket = await db.ticket.create({
    data: {
      societyId: viewer.societyId,
      type: "enquiry",
      subject: `Water & pump system — ${WATER_PLAN_LABEL[plan]}`,
      detail: [
        `Asked for: ${WATER_PLAN_LABEL[plan]}`,
        `Contact: ${viewer.name ?? viewer.email} · ${viewer.email} · ${phone}`,
        input.note.trim() ? `Note: ${input.note.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      raisedById: viewer.id,
    },
  });
  logger.info("portal.water_enquiry_raised", { ticketId: ticket.id, societyId: viewer.societyId, actorId: viewer.id, plan });
  revalidatePath("/portal/tanks");
  revalidatePath("/portal");
  return { ok: true };
}
