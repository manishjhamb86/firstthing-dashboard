import { db } from "@/lib/db";
import { Card, CardTitle, StatusChip } from "@/components/ui";
import { formatDate, formatInstant, monthLabel } from "@/lib/format-date";
import { formatMobile } from "@/lib/society-members";
import { publicS3Url } from "@/lib/s3";
import { CATEGORY_LABEL, CONDITIONS, generateUnits, type PumpStructure } from "@/lib/pump-room";
import { contestedAreaNames, loadPumpRoom, sectionGaps } from "@/lib/survey-core";
import { SECTION_LABEL, sectionStates, SURVEY_SECTIONS, type SectionState, type SurveySection } from "@/lib/survey-shell";
import { QuerySectionControl } from "./query-section-control";

const STATE_META: Record<SectionState, { label: string; tone: "ok" | "warn" | "neu" | "info" | "bad" }> = {
  not_started: { label: "Not started", tone: "neu" },
  in_progress: { label: "In progress", tone: "info" },
  complete: { label: "Complete", tone: "ok" },
  flagged: { label: "Flagged", tone: "warn" },
  queried: { label: "Queried — reopened", tone: "bad" },
};

/**
 * The office's view of a survey done on the phone (05-field.md SCR-014, the
 * part this build has): each section's state and what was flagged, the
 * profile and access, the types with no eligible circuit and each circuit's
 * typicality answer, the pump room, and every photo. Operations can query a
 * section of a submitted survey, which reopens that section — and only it —
 * on every team member's phone.
 *
 * Shown only for a survey the field has worked on: one filled in at the desk
 * has no section rows and looks exactly as it always did.
 */
export async function FieldSurveyReview({ pipelineId, surveyId, canQuery }: { pipelineId: string; surveyId: string; canQuery: boolean }) {
  const survey = await db.siteSurvey.findUnique({
    where: { id: surveyId },
    include: {
      submittedBy: { select: { name: true, email: true } },
      sections: true,
      photos: { orderBy: { createdAt: "asc" } },
      typeOutcomes: { include: { recordedBy: { select: { name: true, email: true } } } },
      circuits: { where: { voidedAt: null, typicalityNote: { not: null } }, select: { id: true, location: true, lightType: true, typicalityNote: true } },
      pipeline: { select: { societyId: true } },
    },
  });
  if (!survey || (survey.sections.length === 0 && survey.status === "draft")) return null;

  const states = sectionStates(survey.sections as { section: SurveySection; state: SectionState }[]);
  const rows = new Map(survey.sections.map((s) => [s.section as SurveySection, s]));
  const [gaps, contested, members, room] = await Promise.all([
    Promise.all(SURVEY_SECTIONS.map(async (s) => [s, await sectionGaps(surveyId, s)] as const)),
    contestedAreaNames(surveyId),
    db.societyMember.findMany({
      where: { societyId: survey.pipeline.societyId, endedOn: null },
      select: { name: true, mobile: true, primaryContact: true, position: { select: { name: true } } },
    }),
    loadPumpRoom(surveyId),
  ]);
  const gapsBy = new Map(gaps);
  const primary = members.find((m) => m.primaryContact);
  const photosOf = (subject: string, prefix = "") => survey.photos.filter((p) => p.subject === subject && p.subjectKey.startsWith(prefix));
  const units = room.structure ? generateUnits(room.structure as PumpStructure) : [];

  return (
    <Card className="mb-5 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Field survey</CardTitle>
        {survey.status === "submitted" ? (
          <StatusChip tone="ok">
            Submitted {survey.submittedAt ? formatInstant(survey.submittedAt) : ""}
            {survey.submittedBy ? ` by ${survey.submittedBy.name ?? survey.submittedBy.email}` : ""}
          </StatusChip>
        ) : (
          <StatusChip tone="info">Being captured on the phone</StatusChip>
        )}
      </div>
      {survey.status === "submitted" && (
        <p className="text-sm text-[var(--text-muted)]">Read-only for the field team. Query a section to reopen it — only that section — on their phones.</p>
      )}

      <ul className="divide-y divide-[var(--border-subtle)]">
        {SURVEY_SECTIONS.map((s) => {
          const row = rows.get(s);
          const meta = STATE_META[states[s]];
          const g = gapsBy.get(s) ?? [];
          return (
            <li key={s} className="py-3 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{SECTION_LABEL[s]}</span>
                <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
              </div>
              {states[s] === "flagged" && row?.flagReason && <p className="text-sm" style={{ color: "var(--warn-fg)" }}>Flagged: {row.flagReason}</p>}
              {states[s] === "queried" && row?.queryNote && <p className="text-sm" style={{ color: "var(--bad-fg)" }}>Queried: {row.queryNote}</p>}
              {states[s] !== "complete" && states[s] !== "flagged" && g.length > 0 && (
                <p className="text-sm text-[var(--text-muted)]">Still open: {g.slice(0, 3).join(" ")}{g.length > 3 ? ` …and ${g.length - 3} more` : ""}</p>
              )}
              {canQuery && survey.status === "submitted" && states[s] !== "queried" && (
                <QuerySectionControl pipelineId={pipelineId} surveyId={surveyId} section={s} label={SECTION_LABEL[s]} />
              )}
            </li>
          );
        })}
      </ul>

      {contested.length > 0 && (
        <p className="text-sm" style={{ color: "var(--warn-fg)" }}>Counted by two people, not yet settled: {contested.join(", ")}.</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1 text-sm">
          <p className="lbl">Profile & access</p>
          <p>
            {survey.address ?? "No address"}
            {survey.latitude !== null ? (
              <>
                {" "}·{" "}
                <a className="underline" href={`https://www.google.com/maps?q=${survey.latitude},${survey.longitude}`} target="_blank" rel="noreferrer">
                  {survey.latitude.toFixed(5)}, {survey.longitude?.toFixed(5)}
                </a>{" "}
                <span className="text-[var(--text-muted)]">{survey.locationManual ? "(entered by hand)" : survey.locationAccuracyM ? `(±${Math.round(survey.locationAccuracyM)} m)` : ""}</span>
              </>
            ) : null}
          </p>
          <p>
            Primary contact: {primary ? `${primary.name} · ${primary.position.name} · ${formatMobile(primary.mobile)}` : "not recorded"} ({members.length} on the committee)
          </p>
          {(survey.gateContactName || survey.accessHours || survey.noticeRequired) && (
            <p className="text-[var(--text-muted)]">
              {survey.gateContactName ? `Gate: ${survey.gateContactName}${survey.gateContactPhone ? ` ${formatMobile(survey.gateContactPhone)}` : ""}. ` : ""}
              {survey.accessHours ? `Hours: ${survey.accessHours}. ` : ""}
              {survey.noticeRequired === "days" ? `Notice: ${survey.noticeDays} days. ` : survey.noticeRequired === "same_day" ? "Notice: same day. " : ""}
              {survey.passIdNotes ? `Pass: ${survey.passIdNotes}.` : ""}
            </p>
          )}
          {survey.nextElectionDate && <p className="text-[var(--text-muted)]">Next election {formatDate(survey.nextElectionDate)}{survey.rwaMemberCount ? ` · ${survey.rwaMemberCount} RWA members` : ""}</p>}
        </div>

        <div className="space-y-1 text-sm">
          <p className="lbl">Circuits</p>
          {survey.circuits.map((c) => (
            <div key={c.id}>
              <p className="font-medium">{c.lightType} — {c.location}</p>
              <p className="text-[var(--text-muted)]">Typical because: {c.typicalityNote}</p>
              <p className="flex flex-wrap gap-2">
                {photosOf("circuit", c.id).map((p, i) => (
                  <a key={p.id} className="underline" href={publicS3Url(p.key)} target="_blank" rel="noreferrer">Panel photo {i + 1}</a>
                ))}
              </p>
            </div>
          ))}
          {survey.typeOutcomes.map((o) => (
            <p key={o.id} style={{ color: "var(--warn-fg)" }}>
              No eligible circuit for {o.lightType}: {o.reason} Leave it out of the deal, or approve an exception.{" "}
              <span className="text-[var(--text-muted)]">Recorded by {o.recordedBy.name ?? o.recordedBy.email}.</span>
            </p>
          ))}
          {survey.circuits.length === 0 && survey.typeOutcomes.length === 0 && <p className="text-[var(--text-muted)]">None recorded on the phone.</p>}
        </div>
      </div>

      {room.structure && (
        <div className="space-y-1 text-sm">
          <p className="lbl">Pump room</p>
          <p>
            {room.structure.pumpCount} × {room.structure.pumpHp} HP {room.structure.pumpType} · feed {room.structure.feedPipe} · outflow {room.structure.outflowPipe} ·{" "}
            {room.structure.towers.map((t) => `${t.name} (${t.tanks.length} tank${t.tanks.length === 1 ? "" : "s"})`).join(", ")}
          </p>
          <ul className="grid gap-1 md:grid-cols-2">
            {units.map((u) => {
              const a = room.answers.get(u.unitKey);
              const ph = photosOf("pump_unit", `${u.unitKey}.`);
              return (
                <li key={u.unitKey}>
                  {u.label} — {CATEGORY_LABEL[u.category].toLowerCase()}:{" "}
                  {a?.installed === false ? "not fitted" : a?.installed ? `${a.brand} ${a.model}, ${CONDITIONS.find(([k]) => k === a.condition)?.[1]?.toLowerCase() ?? "?"}` : "not answered"}
                  {ph.map((p, i) => (
                    <a key={p.id} className="ml-2 underline" href={publicS3Url(p.key)} target="_blank" rel="noreferrer">photo {i + 1}</a>
                  ))}
                </li>
              );
            })}
          </ul>
          <p className="text-[var(--text-muted)]">
            Logbook:{" "}
            {room.logbookNotMaintained
              ? "not maintained"
              : room.logbookPages.length === 0
                ? "not photographed"
                : [...new Set(room.logbookPages.map((p) => p.month))].sort().map((m) => monthLabel(m)).join(", ")}
          </p>
          <p className="flex flex-wrap gap-2">
            {photosOf("logbook").map((p) => (
              <a key={p.id} className="underline" href={publicS3Url(p.key)} target="_blank" rel="noreferrer">{p.month ? monthLabel(p.month) : "page"}</a>
            ))}
          </p>
        </div>
      )}
    </Card>
  );
}
