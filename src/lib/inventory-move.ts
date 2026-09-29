import type { Prisma, PrismaClient } from "@prisma/client";
import { nextState, type MoveKind, type UnitStatus } from "./inventory";

/**
 * Moving serialized stock by code — the back office's `moveUnits` and the
 * field app's queued move (2026-09-29) both run THIS, so a unit moved from a
 * phone in a basement obeys exactly the lifecycle the back office does
 * (nextState in inventory.ts). It takes a client so the field path can run it
 * inside the same transaction as its sync receipt.
 */

type Client = Prisma.TransactionClient | PrismaClient;

export type UnitMoveInput = {
  codes: string[];
  kind: MoveKind;
  on: string; // YYYY-MM-DD
  toOfficeId: string;
  societyId: string;
  circuitId: string;
  reason: string;
};

export type MoveResult = { done: number; failed: { code: string; error: string }[] };

const REASON_NEEDED: MoveKind[] = ["mark_faulty", "scrap", "lost", "return_to_supplier"];

/** A society's stock site, created the first time anything is deployed there. */
export async function siteFor(client: Client, societyId: string): Promise<string | null> {
  const existing = await client.stockLocation.findUnique({ where: { societyId } });
  if (existing) return existing.id;
  const society = await client.society.findUnique({ where: { id: societyId }, select: { name: true, location: true } });
  if (!society) return null;
  const created = await client.stockLocation.create({ data: { kind: "site", name: society.name, address: society.location, societyId } });
  return created.id;
}

/** Where a move is going: an office, or a society's site. */
export async function moveDestination(
  client: Client,
  kind: MoveKind,
  input: { toOfficeId: string; societyId: string },
): Promise<{ id: string } | { error: string } | null> {
  if (kind === "deploy") {
    if (!input.societyId) return { error: "Choose the society it is deployed at." };
    const id = await siteFor(client, input.societyId);
    return id ? { id } : { error: "That society no longer exists." };
  }
  if (kind === "transfer" || kind === "return_to_office") {
    const office = input.toOfficeId ? await client.stockLocation.findUnique({ where: { id: input.toOfficeId } }) : null;
    if (!office || office.kind !== "office") return { error: "Choose the office." };
    return { id: office.id };
  }
  return null;
}

function day(s: string): Date | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null;
}

/**
 * What is wrong with the move as a whole — before any unit is looked at. A
 * whole-move refusal writes nothing; per-unit problems are reported per code
 * and the rest of the pile still moves.
 */
export function refuseUnitMove(input: UnitMoveInput, now: Date): string | null {
  const on = day(input.on);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (!on || on.getTime() > today) return "Enter the date it happened (not in the future).";
  if (REASON_NEEDED.includes(input.kind) && !input.reason.trim()) return "Say why — it is kept with the record.";
  if (input.codes.filter((c) => c.trim()).length === 0) return "Scan at least one unit.";
  return null;
}

/**
 * Apply a move to each unit on its own: a refused unit is named and the rest
 * still move. Every change is a ledger row plus the unit's new state.
 */
export async function applyUnitMove(client: Client, actorId: string, input: UnitMoveInput): Promise<MoveResult | { error: string }> {
  const refusal = refuseUnitMove(input, new Date());
  if (refusal) return { error: refusal };
  const on = day(input.on)!;
  const dest = await moveDestination(client, input.kind, input);
  if (dest && "error" in dest) return { error: dest.error };

  const codes = [...new Set(input.codes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
  const units = await client.inventoryUnit.findMany({ where: { code: { in: codes } } });
  const failed: MoveResult["failed"] = codes
    .filter((c) => !units.some((u) => u.code === c))
    .map((c) => ({ code: c, error: "No unit has this code." }));
  let done = 0;
  for (const u of units) {
    const t = nextState(u.status as UnitStatus, input.kind);
    if ("error" in t) {
      failed.push({ code: u.code, error: t.error });
      continue;
    }
    const toId = t.to === "keep" ? u.locationId : t.to === "none" ? null : dest && "id" in dest ? dest.id : null;
    if (input.kind === "transfer" && toId === u.locationId) {
      failed.push({ code: u.code, error: "It is already at that office." });
      continue;
    }
    await client.stockMovement.create({
      data: {
        kind: input.kind,
        on,
        itemTypeId: u.itemTypeId,
        batchId: u.batchId,
        unitId: u.id,
        quantity: 1,
        fromLocationId: t.to === "keep" ? null : u.locationId,
        toLocationId: t.to === "keep" ? null : toId,
        circuitId: input.kind === "deploy" ? input.circuitId || null : null,
        reason: input.reason.trim() || null,
        recordedById: actorId,
      },
    });
    await client.inventoryUnit.update({
      where: { id: u.id },
      data: {
        status: t.status,
        locationId: toId,
        circuitId: input.kind === "deploy" ? input.circuitId || null : t.status === "deployed" ? u.circuitId : null,
        deployedOn: input.kind === "deploy" ? on : t.status === "deployed" || t.status === "faulty" ? u.deployedOn : null,
      },
    });
    done += 1;
  }
  return { done, failed };
}
