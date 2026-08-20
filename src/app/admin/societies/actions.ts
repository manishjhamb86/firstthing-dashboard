"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SocietyStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import { resolveBackdate } from "@/lib/step-dates";

// FEAT-085: society record & lifecycle. A society starts as a `prospect`
// (FEAT-085-AC-1: "created from a lead, minimal data") and moves through
// active/suspended/terminated from there — status transitions are a
// separate action (updateSocietyStatus) from creation, not bundled with a
// customer login the way the archived app's createSociety did (that
// coupling doesn't match this schema: a Society and its portal accounts are
// deliberately separate concerns now, see FEAT-108-AC-8 / portal-actions.ts).
//
// Known, deliberate gap (not guessed at): FEAT-085-AC-5 asks for each
// service-line engagement's *independent* state on one society record (one
// active-billing, one mid-pipeline). That needs a real Engagement entity
// this milestone's schema doesn't have yet — Circuit already carries
// `serviceLine` per row, but there's no per-engagement status to roll up.
// Left for whichever milestone actually needs multi-service-line societies;
// this screen shows one status per society, honestly, not a fabricated one.

export async function createSociety(input: {
  name: string;
  location: string;
  flatCount: number;
  confirmDuplicate?: boolean;
  /** DEMO_MODE only — backdate the record so a past deal can start here. */
  createdOn?: string;
}) {
  await requireAdmin();

  const name = input.name.trim();
  const location = input.location.trim();

  if (!name || !location) return { error: "Society name and location are required." };
  if (!Number.isFinite(input.flatCount) || input.flatCount <= 0) {
    return { error: "Flat count must be a positive number." };
  }

  // FEAT-085-AC-3: a same-name/same-location duplicate is flagged for
  // review, never silently created — duplicates fracture a society's
  // history across two records. There's no separate review queue built yet,
  // so this blocks creation and asks the operator to explicitly confirm
  // rather than defaulting to allow.
  if (!input.confirmDuplicate) {
    const existing = await db.society.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, location: { equals: location, mode: "insensitive" } },
    });
    if (existing) {
      logger.warn("society.duplicate_flagged", { name, location, existingId: existing.id });
      return {
        error: `A society named "${existing.name}" in ${existing.location} already exists.`,
        duplicateOf: existing.id,
      };
    }
  }

  // The first date in a backdated deal. Everything after it is ordered
  // against this one, so it only has to not be in the future.
  const createdAt = resolveBackdate(input.createdOn, "The society record");
  if (typeof createdAt === "string") return { error: createdAt };

  const society = await db.society.create({
    data: {
      name,
      location,
      flatCount: input.flatCount,
      status: "prospect",
      ...(createdAt ? { createdAt } : {}),
    },
  });

  logger.info("society.created", { societyId: society.id, name, location, backdatedTo: createdAt ?? null });
  revalidatePath("/admin/societies");
  redirect(`/admin/societies/${society.id}`);
}

export async function updateSocietyStatus(id: string, status: SocietyStatus) {
  const session = await requireAdmin();
  await db.society.update({ where: { id }, data: { status } });
  logger.info("society.status_changed", { actorId: session.user.id, societyId: id, status });
  revalidatePath(`/admin/societies/${id}`);
  revalidatePath("/admin/societies");
  return {};
}

// FEAT-039: enroll a society in a service line. This is the entity
// FEAT-085-AC-5's gap comment above was waiting on — each engagement now
// carries its own independent status, separate from any other service
// line's. Gated the same way society status changes already are
// (requireAdmin, not a named permission) — PER-01's own tooling access is
// already the broadest in this app, matching the existing convention rather
// than fragmenting the permission model further for one more admin action.
export async function enrollServiceLine(societyId: string, serviceLine: string) {
  const session = await requireAdmin();

  // FEAT-039-AC-3 — one engagement per (society, serviceLine), enforced at
  // the DB too (@@unique), but checked here first for a clean error message.
  const existing = await db.engagement.findUnique({
    where: { societyId_serviceLine: { societyId, serviceLine: serviceLine as never } },
  });
  if (existing) return { error: "This society is already enrolled in that service line." };

  await db.engagement.create({ data: { societyId, serviceLine: serviceLine as never } });
  logger.info("society.service_line_enrolled", { actorId: session.user.id, societyId, serviceLine });
  revalidatePath(`/admin/societies/${societyId}`);
  return {};
}
