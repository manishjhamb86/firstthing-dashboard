import Link from "next/link";
import { notFound } from "next/navigation";
import { loadFieldSurvey } from "@/lib/field-survey";
import { logbookMonths } from "@/lib/pump-room";
import { loadPumpRoom } from "@/lib/survey-core";
import { requireFieldPage } from "../../../access";
import { PumpRoomForm } from "./pump-room-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pump room" };

/**
 * SCR-013 — every piece of pump-room equipment as a physical unit, and the
 * room's consumption logbook. Built for a pump room: large targets, one hand,
 * a torch in the other. The unit list is generated from the room's structure.
 */
export default async function SurveyPumpRoomPage({ params }: { params: Promise<{ pipelineId: string }> }) {
  const admin = await requireFieldPage();
  const { pipelineId } = await params;
  const s = await loadFieldSurvey(pipelineId, admin);
  if (!s || !s.survey) notFound();
  const section = s.survey.sections.find((x) => x.section === "pump_room")!;
  const room = await loadPumpRoom(s.survey.id);

  return (
    <>
      <header className="mb-4">
        <Link href={`/field/survey/${pipelineId}`} className="text-[var(--text-muted)]">
          ← {s.societyName} · survey
        </Link>
        <h1 className="text-[24px] font-bold leading-tight">Pump room</h1>
      </header>
      {section.state === "queried" && section.queryNote && (
        <p className="card p-3 mb-4" style={{ background: "var(--bad-bg)", color: "var(--bad-fg)", borderColor: "var(--bad-line)" }}>
          The office asks: {section.queryNote}
        </p>
      )}
      {!section.writable && <p className="card p-3 mb-4">This survey has been submitted, so this section is read-only.</p>}
      <PumpRoomForm
        surveyId={s.survey.id}
        label={s.societyName}
        writable={section.writable}
        state={section.state}
        flagReason={section.flagReason}
        structure={room.structure}
        answers={Object.fromEntries(room.answers)}
        logbookNotMaintained={room.logbookNotMaintained}
        logbookMonthsWithPages={[...new Set(room.logbookPages.map((p) => p.month))]}
        months={logbookMonths(new Date())}
      />
    </>
  );
}
