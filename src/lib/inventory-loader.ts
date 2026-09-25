// Server-side reads shared by the inventory pages.

import { db } from "@/lib/db";
import { circuitLabelOf } from "@/lib/circuit-label";

/** What the move forms need: offices, and societies with their circuits. */
export async function moveContext() {
  const [offices, societies] = await Promise.all([
    db.stockLocation.findMany({ where: { kind: "office", active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.society.findMany({
      where: { closedAt: null },
      select: { id: true, name: true, circuits: { where: { voidedAt: null }, select: { id: true, location: true, lightType: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    offices,
    societies: societies.map((s) => ({ id: s.id, name: s.name, circuits: s.circuits.map((c) => ({ id: c.id, label: circuitLabelOf(c.location, c.lightType) })) })),
    today: new Date().toISOString().slice(0, 10),
  };
}
