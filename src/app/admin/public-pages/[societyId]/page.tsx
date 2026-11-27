import { notFound } from "next/navigation";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { PageHeader, StatusChip } from "@/components/ui";
import { certificateDate, monthLabel } from "@/lib/format-date";
import { loadPublicPageForSociety } from "@/lib/society-public-page";
import { publicPageBase } from "@/lib/public-page-base";
import { PublicPageEditor, type SectionSummary } from "./editor";

export const metadata = { title: "Public page" };

const n = (v: number) => Math.round(v).toLocaleString("en-IN");

/**
 * One society's public page: its address, whether it is live, and — per
 * section — what it shows right now and whether to show it (2026-11-27).
 * The summaries come from the same loader the public page renders from.
 */
export default async function PublicPageEditPage({ params }: { params: Promise<{ societyId: string }> }) {
  await requireAdminPage();
  const viewer = await resolveAdmin();
  const { societyId } = await params;
  const p = await loadPublicPageForSociety(societyId);
  if (!p) notFound();
  const base = await publicPageBase();

  const pumpPct =
    p.pumpRoom && p.pumpRoom.nowKwhPerKl !== null && p.pumpRoom.beforeKwhPerKl > 0
      ? Math.round(((p.pumpRoom.beforeKwhPerKl - p.pumpRoom.nowKwhPerKl) / p.pumpRoom.beforeKwhPerKl) * 100)
      : null;
  const initiatives = [
    p.lights.total > 0 && `${n(p.lights.total)} LED lights installed`,
    p.tanks > 0 && `${n(p.tanks)} water tank${p.tanks === 1 ? "" : "s"} monitored`,
    p.pumpRoom && (pumpPct !== null && pumpPct > 0 ? `Pump room: ${pumpPct}% less electricity per kilolitre` : "Pump-room automation"),
  ].filter(Boolean) as string[];

  const summaries: SectionSummary[] = [
    {
      key: "initiatives",
      now: initiatives.length > 0 ? initiatives.join(" · ") : "Nothing installed yet — shows a “journey has begun” card.",
    },
    {
      key: "impact",
      now: p.savings
        ? `${n(p.savings.savedKwh)} kWh saved${p.savings.savingsPct !== null ? ` · ${Math.round(p.savings.savingsPct)}%` : ""} · ${p.savings.months} month${p.savings.months === 1 ? "" : "s"}${p.pumpRoom && p.pumpRoom.savedKwh > 0 ? ` · pump room ${n(p.pumpRoom.savedKwh)} kWh` : ""}`
        : p.pumpRoom && p.pumpRoom.savedKwh > 0
          ? `Pump room ${n(p.pumpRoom.savedKwh)} kWh saved`
          : "No released month yet — this section appears once there is one.",
      empty: !p.savings && !(p.pumpRoom && p.pumpRoom.savedKwh > 0),
    },
    {
      key: "story",
      now: `${p.intro ? "The RWA's own words" : "The standard paragraph"} · ${p.location}${p.partnerSince ? ` · partner since ${monthLabel(p.partnerSince)}` : ""}`,
    },
    {
      key: "testimonial",
      now: p.testimonial ? `“${p.testimonial.quote.slice(0, 90)}${p.testimonial.quote.length > 90 ? "…" : ""}” — ${p.testimonial.authorName}` : "None published for this society yet.",
      empty: !p.testimonial,
      link: { href: "/admin/homepage/testimonials", label: p.testimonial ? "Manage testimonials" : "Add or publish one" },
    },
    {
      key: "recognition",
      now: `Dated ${certificateDate(p.recognisedOn)}`,
    },
  ];

  return (
    <>
      <PageHeader
        backHref="/admin/public-pages"
        title={p.name}
        chip={<StatusChip tone={p.enabled ? "ok" : "neu"}>{p.enabled ? "Live" : "Off"}</StatusChip>}
        subtitle="What this society's public page shows. Changes are live as soon as they are saved."
      />
      <PublicPageEditor
        societyId={p.societyId}
        base={base}
        canEdit={!!viewer && isOperations(viewer.team)}
        initial={{ slug: p.slug, enabled: p.enabled, showLeadership: p.showLeadership, intro: p.intro ?? "", hidden: p.hidden }}
        summaries={summaries}
        members={p.leadership}
        membersHref={`/admin/societies/${p.societyId}/members`}
      />
    </>
  );
}
