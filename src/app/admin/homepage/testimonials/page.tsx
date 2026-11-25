import Link from "next/link";
import { db } from "@/lib/db";
import { Card, EmptyState, PageHeader, StatusChip, type ChipTone } from "@/components/ui";
import { formatDate } from "@/lib/format-date";
import { requireHomepageStaff } from "../access";
import { publicS3Url } from "@/lib/s3";
import { AddTestimonial, TestimonialRow } from "./testimonial-controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Testimonials" };

const TABS = [
  { key: "pending", label: "Waiting for review" },
  { key: "published", label: "On the homepage" },
  { key: "held", label: "On hold" },
  { key: "rejected", label: "Rejected" },
] as const;
const TONE: Record<string, ChipTone> = { pending: "warn", published: "ok", held: "neu", rejected: "bad" };
const SOURCE: Record<string, string> = { portal: "From the society portal", imported: "From the old homepage", back_office: "Added here" };

/**
 * Customers' words for the public homepage (2026-11-25, user-asked): written
 * in the society portal, reviewed here — published, held, or rejected.
 * Only published ones show on the homepage, in the order set here.
 */
export default async function TestimonialsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireHomepageStaff();
  const { tab: raw } = await searchParams;
  const counts = await db.testimonial.groupBy({ by: ["status"], _count: { _all: true } });
  const count = (k: string) => counts.find((c) => c.status === k)?._count._all ?? 0;
  const tab = (TABS.find((t) => t.key === raw)?.key ?? (count("pending") > 0 ? "pending" : "published")) as (typeof TABS)[number]["key"];
  const [rows, societies] = await Promise.all([
    db.testimonial.findMany({
      where: { status: tab },
      orderBy: tab === "published" ? [{ priority: "asc" }, { reviewedAt: "desc" }] : [{ createdAt: "desc" }],
      include: { society: { select: { name: true } } },
    }),
    db.society.findMany({ where: { closedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const reviewers = await db.adminUser.findMany({ where: { id: { in: rows.map((r) => r.reviewedById).filter((x): x is string => !!x) } }, select: { id: true, name: true, email: true } });
  const authors = await db.profile.findMany({ where: { id: { in: rows.map((r) => r.submittedByProfileId).filter((x): x is string => !!x) } }, select: { id: true, email: true } });

  return (
    <>
      <PageHeader
        title="Testimonials"
        subtitle="What customers say, for the public homepage. Societies write them in their portal; publish the ones to show, hold or reject the rest."
        action={
          <Link href="/" target="_blank" className="btn-secondary btn-sm">
            View the homepage
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/homepage/testimonials?tab=${t.key}`} className="chip-filter" aria-current={tab === t.key ? "page" : undefined}>
            {t.label} · {count(t.key)}
          </Link>
        ))}
      </div>
      <Card className="mb-5 overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nothing here">
              {tab === "pending" ? "New testimonials from the society portal appear here for review." : "None in this list."}
            </EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {rows.map((t) => {
              const reviewer = reviewers.find((r) => r.id === t.reviewedById);
              const author = authors.find((a) => a.id === t.submittedByProfileId);
              return (
                <li key={t.id} className="p-5">
                  <TestimonialRow
                    t={{
                      id: t.id,
                      quote: t.quote,
                      authorName: t.authorName,
                      authorRole: t.authorRole ?? "",
                      place: t.place ?? "",
                      priority: t.priority,
                      status: t.status,
                      societyId: t.societyId ?? "",
                      authorPhotoUrl: t.authorPhotoKey ? publicS3Url(t.authorPhotoKey) : null,
                      buildingPhotoUrl: t.buildingPhotoKey ? publicS3Url(t.buildingPhotoKey) : null,
                    }}
                    meta={
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
                        <StatusChip tone={TONE[t.status]!}>{TABS.find((x) => x.key === t.status)?.label}</StatusChip>
                        <span>{SOURCE[t.source]}</span>
                        {t.society && <span>· {t.society.name}</span>}
                        {author && <span>· by {author.email}</span>}
                        <span>· {formatDate(t.createdAt)}</span>
                        {t.consentAt && <span>· agreed to being shown {formatDate(t.consentAt)}</span>}
                        {reviewer && t.reviewedAt && (
                          <span>
                            · reviewed by {reviewer.name ?? reviewer.email} on {formatDate(t.reviewedAt)}
                          </span>
                        )}
                        {t.reviewNote && <span>· “{t.reviewNote}”</span>}
                      </span>
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card className="p-5">
        <p className="mb-1 text-[15px] font-semibold">Add a testimonial</p>
        <p className="mb-4 text-[13px] text-[var(--text-muted)]">For words a customer gave by email or phone. It starts on hold; publish it when it is confirmed.</p>
        <AddTestimonial societies={societies} />
      </Card>
    </>
  );
}
