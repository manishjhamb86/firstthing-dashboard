import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatInstant } from "@/lib/format-date";
import { loadFieldSurvey } from "@/lib/field-survey";
import { areaKeyOf, FIELD_AREA_TYPES } from "@/lib/survey-shell";
import { requireFieldPage } from "../../../access";
import { InventoryForm, type Row } from "./inventory-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lighting inventory" };

/**
 * SCR-011 — every common-area light, by area. "This is the number that bills
 * the society for the whole term." Each row records who counted it: that is
 * the area claim (§0.1b). Two people's counts of one area are never summed or
 * merged; the area is contested until one count is chosen.
 */
export default async function SurveyInventoryPage({ params }: { params: Promise<{ pipelineId: string }> }) {
  const admin = await requireFieldPage();
  const { pipelineId } = await params;
  const s = await loadFieldSurvey(pipelineId, admin);
  if (!s || !s.survey) notFound();
  const section = s.survey.sections.find((x) => x.section === "inventory")!;

  const rows = await db.lightingInventoryArea.findMany({
    where: { siteSurveyId: s.survey.id, voidedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      area: true,
      areaType: true,
      label: true,
      lightType: true,
      count: true,
      method: true,
      note: true,
      createdAt: true,
      countedById: true,
      countedBy: { select: { name: true, email: true } },
    },
  });
  const view: Row[] = rows.map((r) => ({
    id: r.id,
    area: r.area,
    areaKey: areaKeyOf(r.areaType, r.label, r.area),
    lightType: r.lightType,
    count: r.count,
    method: r.method,
    note: r.note ?? "",
    countedBy: r.countedById ?? "office",
    countedByName: r.countedBy ? (r.countedBy.name ?? r.countedBy.email) : "The office",
    countedAt: formatInstant(r.createdAt),
  }));
  const typeNames = [...new Set([...rows.map((r) => r.lightType), ...FIELD_AREA_TYPES.filter(([k]) => k !== "other").map(([, v]) => v)])];

  return (
    <>
      <header className="mb-4">
        <Link href={`/field/survey/${pipelineId}`} className="text-[var(--text-muted)]">
          ← {s.societyName} · survey
        </Link>
        <h1 className="text-[24px] font-bold leading-tight">Lighting inventory</h1>
      </header>
      {section.state === "queried" && section.queryNote && (
        <p className="card p-3 mb-4" style={{ background: "var(--bad-bg)", color: "var(--bad-fg)", borderColor: "var(--bad-line)" }}>
          The office asks: {section.queryNote}
        </p>
      )}
      {!section.writable && <p className="card p-3 mb-4">This survey has been submitted, so this section is read-only.</p>}
      <InventoryForm
        surveyId={s.survey.id}
        label={s.societyName}
        me={admin.id}
        writable={section.writable}
        state={section.state}
        rows={view}
        typeNames={typeNames}
      />
    </>
  );
}
