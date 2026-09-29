import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatMobile } from "@/lib/society-members";
import { loadFieldSurvey } from "@/lib/field-survey";
import { requireFieldPage } from "../../../access";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Society profile" };

/**
 * SCR-010 — who runs this society, how to reach them, how to get in. The
 * committee is written into the society's member register (19-field-app.md
 * §16), so what is captured here is what every later notification reads.
 */
export default async function SurveyProfilePage({ params }: { params: Promise<{ pipelineId: string }> }) {
  const admin = await requireFieldPage();
  const { pipelineId } = await params;
  const s = await loadFieldSurvey(pipelineId, admin);
  if (!s || !s.survey) notFound();
  const section = s.survey.sections.find((x) => x.section === "profile")!;

  const [profile, members, positions] = await Promise.all([
    db.siteSurvey.findUnique({
      where: { id: s.survey.id },
      select: {
        address: true,
        latitude: true,
        longitude: true,
        locationAccuracyM: true,
        locationManual: true,
        rwaMemberCount: true,
        nextElectionDate: true,
        gateContactName: true,
        gateContactPhone: true,
        accessHours: true,
        noticeRequired: true,
        noticeDays: true,
        parkingNotes: true,
        passIdNotes: true,
      },
    }),
    db.societyMember.findMany({
      where: { societyId: s.societyId, endedOn: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, mobile: true, email: true, primaryContact: true, position: { select: { name: true } } },
    }),
    db.memberPosition.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);
  if (!profile) notFound();

  return (
    <>
      <header className="mb-4">
        <Link href={`/field/survey/${pipelineId}`} className="text-[var(--text-muted)]">
          ← {s.societyName} · survey
        </Link>
        <h1 className="text-[24px] font-bold leading-tight">Society profile & access</h1>
      </header>
      {section.state === "queried" && section.queryNote && (
        <p className="card p-3 mb-4" style={{ background: "var(--bad-bg)", color: "var(--bad-fg)", borderColor: "var(--bad-line)" }}>
          The office asks: {section.queryNote}
        </p>
      )}
      {!section.writable && (
        <p className="card p-3 mb-4">This survey has been submitted, so this section is read-only.</p>
      )}
      <ProfileForm
        surveyId={s.survey.id}
        label={s.societyName}
        writable={section.writable}
        state={section.state}
        flagReason={section.flagReason}
        gaps={section.gaps}
        profile={{
          address: profile.address ?? s.societyLocation,
          latitude: profile.latitude,
          longitude: profile.longitude,
          accuracyM: profile.locationAccuracyM,
          manual: profile.locationManual,
          rwaMemberCount: profile.rwaMemberCount,
          nextElectionDate: profile.nextElectionDate ? profile.nextElectionDate.toISOString().slice(0, 10) : "",
          gateContactName: profile.gateContactName ?? "",
          gateContactPhone: profile.gateContactPhone ?? "",
          accessHours: profile.accessHours ?? "",
          noticeRequired: (profile.noticeRequired ?? "") as "" | "none" | "same_day" | "days",
          noticeDays: profile.noticeDays,
          parkingNotes: profile.parkingNotes ?? "",
          passIdNotes: profile.passIdNotes ?? "",
        }}
        members={members.map((m) => ({ id: m.id, name: m.name, mobile: formatMobile(m.mobile), email: m.email ?? "", position: m.position.name, primary: m.primaryContact }))}
        positions={positions}
      />
    </>
  );
}
