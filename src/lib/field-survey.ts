import { db } from "@/lib/db";
import { dealLabel } from "@/lib/deal-scope";
import { formatDate } from "@/lib/format-date";
import { contestedAreaNames, isOps, sectionGaps, teammatesPending, type SurveyActor } from "@/lib/survey-core";
import { refuseSurveyWrite, sectionStates, submitBlockers, SURVEY_SECTIONS, type SectionState, type SurveySection } from "@/lib/survey-shell";

/**
 * A survey as the field app shows it (19-field-app.md §16): the shell's state
 * and, per section, whether this person may write to it now and what still
 * stops it completing — all as the office knew it when the page was loaded
 * with signal. The office judges everything again when the work arrives.
 */
export async function loadFieldSurvey(pipelineId: string, actor: SurveyActor) {
  const pipeline = await db.pipeline.findUnique({
    where: { id: pipelineId },
    select: {
      serviceLine: true,
      dealScope: true,
      society: { select: { id: true, name: true, location: true } },
      siteSurvey: {
        select: {
          id: true,
          status: true,
          submittedAt: true,
          submittedBy: { select: { name: true, email: true } },
          sections: { select: { section: true, state: true, flagReason: true, queryNote: true } },
        },
      },
    },
  });
  if (!pipeline) return null;
  const survey = pipeline.siteSurvey;
  const base = {
    pipelineId,
    societyId: pipeline.society.id,
    societyName: pipeline.society.name,
    societyLocation: pipeline.society.location,
    deal: dealLabel(pipeline.serviceLine, pipeline.dealScope),
  };
  if (!survey) return { ...base, survey: null };

  const states = sectionStates(survey.sections as { section: SurveySection; state: SectionState }[]);
  const rows = new Map(survey.sections.map((s) => [s.section as SurveySection, s]));
  const sections = await Promise.all(
    SURVEY_SECTIONS.map(async (section) => ({
      section,
      state: states[section],
      flagReason: rows.get(section)?.flagReason ?? null,
      queryNote: rows.get(section)?.queryNote ?? null,
      writable: refuseSurveyWrite({ status: survey.status, sectionState: states[section], isOps: isOps(actor) }) === null,
      gaps: await sectionGaps(survey.id, section),
    })),
  );
  const contested = await contestedAreaNames(survey.id);
  const blockers =
    survey.status === "submitted"
      ? []
      : submitBlockers({ states, contestedAreas: contested, teammatesPending: await teammatesPending(survey.id, actor.id) });

  return {
    ...base,
    survey: {
      id: survey.id,
      status: survey.status,
      submittedLabel: survey.submittedAt ? formatDate(survey.submittedAt) : null,
      submittedBy: survey.submittedBy ? (survey.submittedBy.name ?? survey.submittedBy.email) : null,
      sections,
      contested,
      blockers,
    },
  };
}

export type FieldSurvey = NonNullable<Awaited<ReturnType<typeof loadFieldSurvey>>>;
