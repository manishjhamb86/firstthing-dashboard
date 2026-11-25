import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { PORTAL_AUTHORITY_LABEL } from "@/lib/status-maps";
import { formatDate } from "@/lib/format-date";
import { Card, PageHeader, StatusChip, type ChipTone } from "@/components/ui";
import { TestimonialForm } from "./testimonial-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Share your experience" };

const STATUS: Record<string, { label: string; tone: ChipTone }> = {
  pending: { label: "With FirsThing for review", tone: "warn" },
  published: { label: "On our website", tone: "ok" },
  held: { label: "Received — not on the website", tone: "neu" },
  rejected: { label: "Not published", tone: "neu" },
};

/** Every member may share their experience; FirsThing reviews before anything is public. */
export default async function TestimonialPage() {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) redirect(STALE_SESSION_EXIT);
  const [society, mine] = await Promise.all([
    db.society.findUnique({ where: { id: viewer.societyId }, select: { name: true } }),
    db.testimonial.findMany({ where: { submittedByProfileId: viewer.id }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, quote: true, status: true, createdAt: true } }),
  ]);
  return (
    <>
      <PageHeader title="Share your experience" subtitle="Tell other societies what working with FirsThing has been like. We read every one, and may show it on our website." />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <TestimonialForm defaultName={viewer.name ?? ""} defaultRole={PORTAL_AUTHORITY_LABEL[viewer.role] ?? ""} societyName={society?.name ?? ""} />
        </div>
        {mine.length > 0 && (
          <Card className="p-5 lg:w-[360px] lg:shrink-0">
            <p className="mb-3 text-[15px] font-semibold">What you have shared</p>
            <ul className="flex flex-col gap-3">
              {mine.map((t) => (
                <li key={t.id} className="text-[13.5px]">
                  <p className="line-clamp-3">&ldquo;{t.quote}&rdquo;</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                    <StatusChip tone={STATUS[t.status]!.tone}>{STATUS[t.status]!.label}</StatusChip>
                    {formatDate(t.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
