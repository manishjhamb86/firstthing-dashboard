import type { Tx } from "@/lib/tx";

/**
 * Record a correction with its old value (2026-09-26). Anything edited in
 * place — a demo date, a period, a meter-history entry — keeps what it was,
 * who changed it and why.
 */
export async function logChange(
  tx: Tx,
  entry: {
    entity: string;
    entityId: string;
    kind: string;
    circuitId?: string | null;
    demoId?: string | null;
    meterId?: string | null;
    field?: string | null;
    oldValue?: unknown;
    newValue?: unknown;
    reason?: string | null;
    actorId?: string | null;
  },
): Promise<void> {
  const json = (v: unknown) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v ?? null)));
  await tx.changeLog.create({
    data: {
      entity: entry.entity,
      entityId: entry.entityId,
      kind: entry.kind,
      circuitId: entry.circuitId ?? null,
      demoId: entry.demoId ?? null,
      meterId: entry.meterId ?? null,
      field: entry.field ?? null,
      oldValue: json(entry.oldValue),
      newValue: json(entry.newValue),
      reason: entry.reason ?? null,
      actorId: entry.actorId ?? null,
    },
  });
}
