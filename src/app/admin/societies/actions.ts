"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SocietyStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin, resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { logger } from "@/lib/logger";
import { societyDedupeKey } from "@/lib/society-key";
import { resolveBackdate } from "@/lib/backdate";

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

  // FEAT-085-AC-3, tightened 2026-08-26 (the user's call): a duplicate is
  // REFUSED, not flagged-and-confirmable. The override is what put two
  // "Mahagun Puram / Noida" rows into real data, and a society's history
  // fractured across two records is not something anyone reconciles later.
  // This lookup exists only to give a better message than a constraint
  // violation would — the guarantee is the unique index on dedupeKey, since
  // two operators submitting at once would both find nothing here.
  const dedupeKey = societyDedupeKey(name, location);
  const existing = await db.society.findUnique({ where: { dedupeKey } });
  if (existing) {
    logger.warn("society.duplicate_refused", { name, location, existingId: existing.id });
    return {
      error: `${existing.name} in ${existing.location} is already on the system. Open that record rather than creating a second one.`,
      duplicateOf: existing.id,
    };
  }

  // The first date in a backdated deal. Everything after it is ordered
  // against this one, so it only has to not be in the future.
  const createdAt = await resolveBackdate(input.createdOn, "The society record");
  if (typeof createdAt === "string") return { error: createdAt };

  const society = await db.society.create({
    data: {
      name,
      location,
      dedupeKey,
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

/**
 * Correct a society's own record — its name, where it is, how many flats.
 *
 * Operations only, deliberately stricter than creating one. This follows the
 * rule already set for lead details (2026-08-25): acting *on* a record is one
 * thing, changing what the record *says* is another. Name and location are
 * also the two halves of the uniqueness key, so an edit here can create a
 * duplicate as easily as a create can — and is refused the same way.
 */
export async function updateSocietyDetails(input: {
  id: string;
  name: string;
  location: string;
  /** Null means "not recorded yet" — better than a figure nobody trusts. */
  flatCount: number | null;
}): Promise<{ error?: string; saved?: true }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!isOperations(actor.team)) {
    logger.warn("society.edit_refused", { actorId: actor.id, actorTeam: actor.team, societyId: input.id });
    return { error: "Correcting a society's record is an operations action." };
  }

  const name = input.name.trim();
  const location = input.location.trim();
  if (!name || !location) return { error: "Society name and location are required." };
  if (input.flatCount !== null && (!Number.isFinite(input.flatCount) || input.flatCount <= 0)) {
    return { error: "Flat count must be a positive number, or left blank if it is not known." };
  }

  const society = await db.society.findUnique({ where: { id: input.id }, select: { id: true } });
  if (!society) return { error: "That society no longer exists." };

  const dedupeKey = societyDedupeKey(name, location);
  const clash = await db.society.findUnique({ where: { dedupeKey }, select: { id: true, name: true, location: true } });
  if (clash && clash.id !== input.id) {
    logger.warn("society.edit_duplicate_refused", { actorId: actor.id, societyId: input.id, clashId: clash.id });
    return {
      error: `${clash.name} in ${clash.location} is already on the system — renaming this one to match would make two records for one society.`,
    };
  }

  await db.society.update({
    where: { id: input.id },
    data: { name, location, flatCount: input.flatCount, dedupeKey },
  });
  logger.info("society.details_updated", {
    actorId: actor.id,
    societyId: input.id,
    name,
    location,
    flatCount: input.flatCount,
  });
  revalidatePath(`/admin/societies/${input.id}`);
  revalidatePath("/admin/societies");
  return { saved: true };
}
