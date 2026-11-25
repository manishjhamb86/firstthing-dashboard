import Link from "next/link";
import { Card, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { rupeesShort } from "@/lib/homepage-content";
import { HOMEPAGE_SOCIETY_LIMIT, loadHomepageSocieties } from "@/lib/homepage-content-loader";
import { requireHomepageStaff } from "../access";
import { SocietyStatControl } from "./society-stat-control";

export const dynamic = "force-dynamic";
export const metadata = { title: "Homepage results" };

/**
 * The societies in the homepage's "Real Buildings. Measurable Results."
 * section (2026-11-25, user-asked): the top savings by default, from each
 * society's published months — pin one to put it first, or hold one off.
 */
export default async function HomepageSocietiesPage() {
  await requireHomepageStaff();
  const rows = await loadHomepageSocieties();
  const shown = rows.filter((r) => r.shown).length;
  return (
    <>
      <PageHeader
        title="Homepage results"
        subtitle={`The homepage shows the top ${HOMEPAGE_SOCIETY_LIMIT} societies by savings — pinned ones first, then the rest by savings %, then ₹ saved. Hold one to keep it off.`}
        action={
          <Link href="/#impact" target="_blank" className="btn-secondary btn-sm">
            View on the homepage
          </Link>
        }
      />
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No published savings yet">A society appears here once a month of its savings has been released to it.</EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl tbl-compact">
              <thead>
                <tr>
                  <th>Place</th>
                  <th>Society</th>
                  <th className="text-right">Savings</th>
                  <th className="text-right">Saved to date</th>
                  <th className="text-right">Months</th>
                  <th>On the homepage</th>
                  <th>Setting</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.societyId}>
                    <td className="num">{r.rank ?? "—"}</td>
                    <td>
                      <span className="font-medium">{r.name}</span>
                      <span className="block text-xs text-[var(--text-muted)]">{r.location}</span>
                    </td>
                    <td className="num text-right font-semibold">{r.savingsPct === null ? "—" : `${r.savingsPct.toFixed(2)}%`}</td>
                    <td className="num text-right">{rupeesShort(r.savedValue)}</td>
                    <td className="num text-right">{r.months}</td>
                    <td>
                      {r.shown ? (
                        <StatusChip tone="ok">Shown</StatusChip>
                      ) : r.mode === "held" ? (
                        <StatusChip tone="neu">Held</StatusChip>
                      ) : r.savingsPct === null ? (
                        <StatusChip tone="neu">No figure</StatusChip>
                      ) : (
                        <StatusChip tone="info">Next in line</StatusChip>
                      )}
                    </td>
                    <td>
                      <SocietyStatControl societyId={r.societyId} mode={r.mode} priority={r.priority} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-[var(--border-subtle)] px-5 py-3 text-[12.5px] text-[var(--text-muted)]">
          {shown} shown now. Figures are the ones each society&apos;s own portal shows: released months only, savings weighted by each month&apos;s kWh.
        </p>
      </Card>
    </>
  );
}
