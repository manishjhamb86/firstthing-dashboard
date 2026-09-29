import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { lightTypeKey } from "@/lib/light-type";
import { loadFieldSurvey } from "@/lib/field-survey";
import { liveInventory } from "@/lib/survey-core";
import { requireFieldPage } from "../../../access";
import { CircuitsForm, type TypeCard } from "./circuits-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Circuit selection" };

/**
 * SCR-012 — one circuit per light type, the sampling design of the contract.
 * The work list is generated from the inventory, never typed. Each type needs
 * an outcome: a circuit (eligible, or waiting on an operations exception), or
 * "no eligible circuit" with what was found. A rejected candidate stays on
 * record as evidence the choice was made deliberately.
 */
export default async function SurveyCircuitsPage({ params }: { params: Promise<{ pipelineId: string }> }) {
  const admin = await requireFieldPage();
  const { pipelineId } = await params;
  const s = await loadFieldSurvey(pipelineId, admin);
  if (!s || !s.survey) notFound();
  const section = s.survey.sections.find((x) => x.section === "circuits")!;

  const [inventory, circuits, outcomes, catalog] = await Promise.all([
    liveInventory(s.survey.id),
    db.circuit.findMany({
      where: { siteSurveyId: s.survey.id, voidedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, lightType: true, location: true, state: true, meteredLightCount: true, representedLightCount: true, typicalityNote: true },
    }),
    db.surveyTypeOutcome.findMany({ where: { siteSurveyId: s.survey.id }, select: { lightTypeKey: true, reason: true } }),
    db.deviceType.findMany({
      where: { role: "original", active: true, deletedAt: null, OR: [{ status: "approved", inCatalog: true }, { status: "proposed" }] },
      orderBy: { name: "asc" },
      select: { id: true, name: true, defaultWattage: true },
    }),
  ]);

  const types = new Map<string, TypeCard>();
  for (const r of inventory) {
    const key = lightTypeKey(r.lightType);
    const t = types.get(key) ?? { key, label: r.lightType, surveyed: 0, circuits: [], unresolvable: null };
    t.surveyed += r.count;
    types.set(key, t);
  }
  for (const c of circuits) {
    const t = types.get(lightTypeKey(c.lightType));
    if (t) t.circuits.push({ id: c.id, location: c.location ?? "", state: c.state, metered: c.meteredLightCount, represented: c.representedLightCount });
  }
  for (const o of outcomes) {
    const t = types.get(o.lightTypeKey);
    if (t) t.unresolvable = o.reason;
  }

  return (
    <>
      <header className="mb-4">
        <Link href={`/field/survey/${pipelineId}`} className="text-[var(--text-muted)]">
          ← {s.societyName} · survey
        </Link>
        <h1 className="text-[24px] font-bold leading-tight">Circuit selection</h1>
      </header>
      {section.state === "queried" && section.queryNote && (
        <p className="card p-3 mb-4" style={{ background: "var(--bad-bg)", color: "var(--bad-fg)", borderColor: "var(--bad-line)" }}>
          The office asks: {section.queryNote}
        </p>
      )}
      {!section.writable && <p className="card p-3 mb-4">This survey has been submitted, so this section is read-only.</p>}
      <CircuitsForm surveyId={s.survey.id} label={s.societyName} writable={section.writable} state={section.state} types={[...types.values()]} catalog={catalog} />
    </>
  );
}
