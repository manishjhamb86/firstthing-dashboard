import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusChip } from "@/components/ui";
import { loadFieldSurvey } from "@/lib/field-survey";
import { SECTION_LABEL } from "@/lib/survey-shell";
import { requireFieldPage } from "../../access";
import { SurveySubmit } from "./survey-submit";

export const dynamic = "force-dynamic";
export const metadata = { title: "Survey" };

const PATH: Record<string, string> = { profile: "profile", inventory: "inventory", circuits: "circuits", pump_room: "pump-room" };
const STATE_META: Record<string, { label: string; tone: "ok" | "warn" | "neu" | "info" | "bad" }> = {
  not_started: { label: "Not started", tone: "neu" },
  in_progress: { label: "In progress", tone: "info" },
  complete: { label: "Complete", tone: "ok" },
  flagged: { label: "Flagged", tone: "warn" },
  queried: { label: "Queried by the office", tone: "bad" },
};

/**
 * The survey shell on the phone (05-field.md §0.5): four sections of one
 * container, each with its own state; submission lives here, not in a
 * section. A partial survey is normal — a section can be flagged with a reason.
 */
export default async function FieldSurveyPage({ params }: { params: Promise<{ pipelineId: string }> }) {
  const admin = await requireFieldPage();
  const { pipelineId } = await params;
  const s = await loadFieldSurvey(pipelineId, admin);
  if (!s) notFound();

  return (
    <>
      <header className="mb-4">
        <p className="text-[var(--text-muted)]">
          {s.societyName} · {s.societyLocation}
        </p>
        <h1 className="text-[24px] font-bold leading-tight">Site survey</h1>
        <p className="text-[var(--text-muted)]">{s.deal}</p>
      </header>

      {!s.survey ? (
        <p className="card p-4">No survey yet — it opens once the demo proposal is agreed in the office.</p>
      ) : (
        <>
          {s.survey.status === "submitted" && (
            <p className="card p-3 mb-4" style={{ background: "var(--ok-bg)", color: "var(--ok-fg)", borderColor: "var(--ok-line)" }}>
              Submitted {s.survey.submittedLabel}
              {s.survey.submittedBy ? ` by ${s.survey.submittedBy}` : ""}. It is read-only now, except a section the office reopens.
            </p>
          )}

          <ul className="space-y-2 mb-4">
            {s.survey.sections.map((sec) => {
              const meta = STATE_META[sec.state];
              return (
                <li key={sec.section}>
                  <Link href={`/field/survey/${pipelineId}/${PATH[sec.section]}`} className="card block p-4 min-h-[56px]">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{SECTION_LABEL[sec.section]}</p>
                      <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
                    </div>
                    {sec.state === "flagged" && sec.flagReason && <p className="text-[var(--text-muted)]">{sec.flagReason}</p>}
                    {sec.state === "queried" && sec.queryNote && <p style={{ color: "var(--bad-fg)" }}>The office asks: {sec.queryNote}</p>}
                  </Link>
                </li>
              );
            })}
          </ul>

          {s.survey.status === "draft" && (
            <SurveySubmit pipelineId={pipelineId} surveyId={s.survey.id} label={`${s.societyName} · survey`} blockers={s.survey.blockers} />
          )}
        </>
      )}
    </>
  );
}
