import { redirect } from "next/navigation";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { StarRating } from "@/components/star-rating";
import { formatDate } from "@/lib/format-date";
import { publicStarCards } from "@/lib/star-showcase-loader";
import { ON_TIME_GRACE_DAYS, RATING_WINDOW_DAYS } from "@/lib/payment-rating";

export const dynamic = "force-dynamic";
export const metadata = { title: "Star partner societies" };

/**
 * Every star partner society (2026-10-21). Only societies approved by
 * FirsThing with their committee's consent, and only while their record still
 * bears it out. No society's low rating appears here, or anywhere another
 * society can see.
 */
export default async function StarSocietiesPage() {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) redirect(STALE_SESSION_EXIT);
  const now = new Date();
  const cards = await publicStarCards(now);

  return (
    <>
      <PageHeader
        title="Star partner societies"
        subtitle={`Societies that pay every FirsThing invoice on time — within ${ON_TIME_GRACE_DAYS} days of the due date, over the last ${RATING_WINDOW_DAYS} days — shown with their committee's agreement. As of ${formatDate(now)}.`}
      />
      {cards.length === 0 ? (
        <EmptyState title="No star partners yet">Societies that pay every invoice by its due date can be shown here.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((c) => (
            <Card key={c.societyId} className="p-5">
              <p className="font-bold leading-tight">{c.name}</p>
              <p className="mb-2 text-[12px]" style={{ color: "var(--text-subtle)" }}>
                {c.location}
              </p>
              <StarRating stars={c.stars} size={16} />
              {c.summary && <p className="mt-2 text-[13px]">{c.summary}</p>}
              <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
                Star partner since {formatDate(new Date(c.since))}
                {c.societyId === viewer.societyId && " · your society"}
              </p>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
