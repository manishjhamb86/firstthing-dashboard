// SCR-013 — the pump room audit (FEAT-008) and logbook (FEAT-009). Pure, so
// the phone and the office read one set of rules.
//
// "The single largest data-entry burden in the whole survey": the answer is
// to derive the unit list from the room's own structure (pass 1), so most of
// the work is confirming rows that already exist, not typing (pass 2).

export type Tank = { type: string; capacityL: number | null };
export type Tower = { name: string; tanks: Tank[] };
export type PumpStructure = {
  pumpType: string;
  pumpHp: number | null;
  pumpCount: number | null;
  feedPipe: string;
  outflowPipe: string;
  /** per_pump | shared — only asked when VFDs are fitted. */
  vfdArrangement: "per_pump" | "shared" | "";
  towers: Tower[];
};

export type UnitCategory = "flow_meter" | "pressure_switch" | "vfd" | "energy_meter" | "float_switch" | "actuator_valve";

export const CATEGORY_LABEL: Record<UnitCategory, string> = {
  flow_meter: "Flow meter",
  pressure_switch: "Pressure switch / monitor",
  vfd: "VFD",
  energy_meter: "Pump-room energy meter",
  float_switch: "Float switch / level sensor",
  actuator_valve: "Actuator valve",
};

export const CATEGORY_ORDER: UnitCategory[] = ["flow_meter", "pressure_switch", "vfd", "energy_meter", "float_switch", "actuator_valve"];

export const CONDITIONS = [
  ["working", "Working"],
  ["working_with_faults", "Working with faults"],
  ["not_working", "Not working"],
  ["unknown", "Unknown"],
] as const;
export type Condition = (typeof CONDITIONS)[number][0];

export type GeneratedUnit = { unitKey: string; category: UnitCategory; label: string };

/**
 * The equipment list the room's structure implies (CON-28c's six categories,
 * per unit): one flow meter, pressure switch and energy meter for the room; a
 * VFD per pump, or one shared; a float switch and an actuator valve per tank,
 * named by tower and tank so the surveyor answers rows that already exist.
 */
export function generateUnits(s: PumpStructure): GeneratedUnit[] {
  const out: GeneratedUnit[] = [
    { unitKey: "flow_meter:room", category: "flow_meter", label: "Pump room" },
    { unitKey: "pressure_switch:room", category: "pressure_switch", label: "Pump room" },
  ];
  const pumps = s.pumpCount && s.pumpCount > 0 ? s.pumpCount : 0;
  if (s.vfdArrangement === "shared") out.push({ unitKey: "vfd:shared", category: "vfd", label: "Shared by all pumps" });
  else for (let p = 1; p <= pumps; p++) out.push({ unitKey: `vfd:p${p}`, category: "vfd", label: `Pump ${p}` });
  out.push({ unitKey: "energy_meter:room", category: "energy_meter", label: "Pump room" });
  s.towers.forEach((t, ti) =>
    t.tanks.forEach((_, ki) => {
      const label = `${t.name || `Tower ${ti + 1}`}, Tank ${ki + 1}`;
      out.push({ unitKey: `float_switch:t${ti + 1}:k${ki + 1}`, category: "float_switch", label });
      out.push({ unitKey: `actuator_valve:t${ti + 1}:k${ki + 1}`, category: "actuator_valve", label });
    }),
  );
  return out;
}

/** Why the room's structure cannot be saved as entered, or null. */
export function refuseStructure(s: PumpStructure): string | null {
  if (!s.pumpType.trim()) return "What type of pumps are they?";
  if (s.pumpHp === null || !(s.pumpHp >= 0.5 && s.pumpHp <= 200)) return "How big are the pumps? HP between 0.5 and 200.";
  if (s.pumpCount === null || !Number.isInteger(s.pumpCount) || s.pumpCount < 1 || s.pumpCount > 20) return "How many pumps? Between 1 and 20.";
  if (!s.feedPipe.trim() || !s.outflowPipe.trim()) return "Record the feed and outflow pipe sizes.";
  if (s.towers.length === 0) return "Add the towers the room serves.";
  for (const [i, t] of s.towers.entries()) {
    if (!t.name.trim()) return `Name tower ${i + 1} as the society calls it.`;
    if (t.name.length > 30) return `Keep ${t.name}'s name under 30 characters.`;
    for (const [k, tank] of t.tanks.entries()) {
      if (!tank.type.trim()) return `${t.name}, Tank ${k + 1}: what type of tank is it?`;
      if (tank.capacityL === null || !(tank.capacityL > 0)) return `${t.name}, Tank ${k + 1}: capacity in litres.`;
    }
  }
  return null;
}

export type UnitAnswer = { installed: boolean | null; brand: string; model: string; condition: Condition | null; photos: number };

/** Why a unit's answer is incomplete, named by the unit (never "row 14"), or null. */
export function unitGap(u: GeneratedUnit, a: UnitAnswer | undefined): string | null {
  const name = `${u.label} — ${CATEGORY_LABEL[u.category].toLowerCase()}`;
  if (!a || a.installed === null) return `${name}: is one fitted?`;
  if (!a.installed) return null;
  if (!a.brand.trim() || !a.model.trim()) return `${name}: brand and model — read it off the label, or write "label unreadable".`;
  if (!a.condition) return `${name}: what condition is it in?`;
  if (a.photos === 0) return `${name} needs a photo — an installed item without one isn't a complete audit.`;
  return null;
}

/** The 13 months a logbook page may record: this month and the 12 before it (CON-28d). */
export function logbookMonths(now: Date): string[] {
  const out: string[] = [];
  for (let i = 0; i < 13; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

/** What still stops the pump-room section completing, each named. */
export function pumpRoomGaps(input: {
  structure: PumpStructure | null;
  answers: Map<string, UnitAnswer>;
  logbookNotMaintained: boolean;
  logbookPages: number;
}): string[] {
  if (!input.structure) return ["Start with the room: how many pumps, how many towers, how many tanks."];
  const s = refuseStructure(input.structure);
  if (s) return [s];
  const gaps = generateUnits(input.structure)
    .map((u) => unitGap(u, input.answers.get(u.unitKey)))
    .filter((g): g is string => g !== null);
  if (!input.logbookNotMaintained && input.logbookPages === 0) {
    gaps.push("Photograph the logbook, or record that it isn't maintained.");
  }
  return gaps;
}
