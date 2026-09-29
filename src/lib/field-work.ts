import { db } from "./db";
import { dealLabel } from "./deal-scope";
import { SERVICE_LINE_LABEL } from "./status-maps";

/**
 * One row per piece of field work, whatever kind it is.
 *
 * Read by BOTH the back office's Field work page and the field app's My work
 * (2026-09-29). They are one question — "what has been handed to this
 * person?" — so they share one loader rather than two copies that drift, the
 * failure this codebase has recorded more than once.
 *
 * The admin page listed only SURVEYS, keyed off Pipeline.surveyOwnerId — so a
 * light replacement, which is assigned on the demo, appeared nowhere and the
 * crew holding it saw "nothing assigned to you" (user-reported 2026-08-25). A
 * list titled "the surveys and installations assigned to you" has to mean
 * every kind of assignment, or it is lying.
 */
export type WorkRow = {
  key: string;
  href: string;
  /** Where the field app opens this job, when it has its own screen for it. */
  fieldHref?: string;
  societyName: string;
  societyLocation: string;
  serviceLine: string;
  kind: "survey" | "replacement" | "installation";
  /** The chip: what this row needs. */
  need: { label: string; tone: "warn" | "info" | "neu" };
  assigneeName: string | null;
  visitAt: Date | null;
  contactName: string | null;
  /** For the fallback sort when nothing is booked. */
  touchedAt: Date;
};

/** Operations sees every deal's field work; anyone else sees what they hold. */
export async function loadFieldWork(actorId: string, mineOnly: boolean): Promise<WorkRow[]> {
  const [pipelines, demos] = await Promise.all([
    db.pipeline.findMany({
      where: {
        stage: { notIn: ["closed_lost"] },
        ...(mineOnly ? { surveyOwnerId: actorId } : {}),
      },
      include: {
        society: { select: { id: true, name: true, location: true } },
        surveyOwner: { select: { id: true, name: true, email: true } },
        siteSurvey: { select: { id: true, areas: { select: { id: true } } } },
        installationProject: { select: { id: true, state: true } },
        // The visit lives on the schedule, not on the deal — one module for
        // every appointment (the user's call, 2026-08-25).
        scheduledEvents: {
          where: { kind: "survey_visit", status: "scheduled" },
          orderBy: { startAt: "asc" },
          take: 1,
          select: { startAt: true, contactName: true },
        },
      },
    }),
    // Light replacements: assigned on the demo (2026-09-26), not the deal.
    db.circuitDemo.findMany({
      where: {
        voidedAt: null,
        rejected: false,
        lightReplacementDate: null,
        circuit: { voidedAt: null },
        ...(mineOnly ? { replacementOwnerId: actorId } : { replacementOwnerId: { not: null } }),
      },
      include: {
        circuit: {
          select: {
            id: true,
            societyId: true,
            serviceLine: true,
            lightType: true,
            society: { select: { id: true, name: true, location: true } },
          },
        },
        replacementOwner: { select: { name: true, email: true } },
        scheduledEvents: {
          where: { kind: "installation_day", status: "scheduled" },
          orderBy: { startAt: "asc" },
          take: 1,
          select: { startAt: true, contactName: true },
        },
      },
    }),
  ]);

  const rows: WorkRow[] = [
    ...pipelines.map((p): WorkRow => {
      const areas = p.siteSurvey?.areas.length ?? 0;
      const visit = p.scheduledEvents[0] ?? null;
      return {
        key: `p-${p.id}`,
        href: p.installationProject
          ? `/admin/pipeline/${p.id}/installation`
          : `/admin/pipeline/${p.id}/survey`,
        societyName: p.society.name,
        societyLocation: p.society.location,
        serviceLine: dealLabel(p.serviceLine, p.dealScope),
        kind: p.installationProject ? "installation" : "survey",
        need: p.installationProject
          ? { label: "Installation", tone: "info" }
          : areas === 0
            ? { label: "Run the survey", tone: "warn" }
            : { label: `${areas} ${areas === 1 ? "area" : "areas"} counted`, tone: "neu" },
        assigneeName: p.surveyOwner?.name ?? p.surveyOwner?.email ?? null,
        visitAt: p.installationProject ? null : (visit?.startAt ?? null),
        contactName: visit?.contactName ?? p.contactName,
        touchedAt: p.updatedAt,
      };
    }),
    ...demos.map((d): WorkRow => {
      const c = d.circuit;
      const visit = d.scheduledEvents[0] ?? null;
      return {
        key: `d-${d.id}`,
        href: `/admin/societies/${c.societyId}/circuits/${c.id}?demo=${d.id}`,
        fieldHref: `/field/demo/${d.id}`,
        societyName: c.society.name,
        societyLocation: c.society.location,
        serviceLine: SERVICE_LINE_LABEL[c.serviceLine] ?? c.serviceLine,
        kind: "replacement",
        need: { label: `Replace ${d.meteredLightCount} × ${c.lightType} · demo ${d.sequence}`, tone: "warn" },
        assigneeName: d.replacementOwner?.name ?? d.replacementOwner?.email ?? null,
        visitAt: visit?.startAt ?? null,
        contactName: visit?.contactName ?? null,
        touchedAt: d.replacementAssignedAt ?? d.createdAt,
      };
    }),
  ];

  return sortWork(rows);
}

/**
 * Soonest visit first — this is a list of places to be. Rows with nothing
 * booked follow, most recently touched first. Sorted here rather than in the
 * query because the date belongs to the related event.
 */
export function sortWork<T extends Pick<WorkRow, "visitAt" | "touchedAt">>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.visitAt && b.visitAt) return a.visitAt.getTime() - b.visitAt.getTime();
    if (a.visitAt) return -1;
    if (b.visitAt) return 1;
    return b.touchedAt.getTime() - a.touchedAt.getTime();
  });
}
