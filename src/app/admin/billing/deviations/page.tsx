import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ClickableRow } from "@/components/clickable-row";
import { Card, EmptyState, PageHeader, Stat, StatRow, StatusChip } from "@/components/ui";
import { STATE_LABEL, isOpen, queueRank } from "@/lib/deviation-review";
import { requireBillingOps } from "../access";

// FEAT-055 — the deviation queue. Gated to PER-01 (requireBillingOps), not
// to the billing reader: AC-4 says deviations are not visible to anyone else,
// because these are internal billing judgments and not customer-facing. The
// accountant who releases the month does not see them either.
export const dynamic = "force-dynamic";

export default async function DeviationsPage() {
  const gate = await requireBillingOps();
  if (!gate.ok) redirect("/admin/billing");

  const reviews = await db.deviationReview.findMany({
    include: {
      owner: { select: { name: true, email: true } },
      assignedTo: { select: { name: true, email: true } },
      feeLine: {
        include: {
          circuit: { select: { lightType: true, location: true } },
          calculation: {
            select: { id: true, period: true, coverageOfDays: true, society: { select: { name: true } } },
          },
        },
      },
    },
  });

  const now = new Date();
  const rows = reviews
    .map((r) => ({
      r,
      rank: queueRank({
        state: r.state,
        coverageDays: r.feeLine.coverageDays,
        daysInMonth: r.feeLine.calculation.coverageOfDays,
        raisedAt: r.raisedAt,
        now,
      }),
    }))
    .sort((a, b) => a.rank - b.rank);

  const open = rows.filter((x) => isOpen(x.r.state));
  const undecided = open.filter((x) => x.r.state === "raised" || x.r.state === "assigned");
  const coverageExplains = open.filter(
    (x) => x.r.feeLine.coverageDays < x.r.feeLine.calculation.coverageOfDays,
  );
  const exposing = rows.filter(
    (x) => x.r.rootCause === "firsthing_attributable" && !x.r.correctedAtNoCost,
  );

  return (
    <>
      <PageHeader
        backHref="/admin/billing"
        title="Deviations"
        subtitle="Out-of-band circuit-months, most urgent first."
        chip={
          undecided.length > 0 ? (
            <StatusChip tone="warn">{undecided.length} undecided</StatusChip>
          ) : open.length === 0 ? (
            <StatusChip tone="ok">Caught up</StatusChip>
          ) : undefined
        }
      />

      <StatRow>
        <Stat
          label="Open reviews"
          value={open.length}
          tone={undecided.length > 0 ? "warn" : "ok"}
          detail={open.length === 0 ? "nothing outstanding" : `${undecided.length} not yet decided`}
        />
        <Stat
          label="A coverage gap may explain"
          value={coverageExplains.length}
          detail={
            coverageExplains.length === 0
              ? "every open month reported in full"
              : "resolvable without a site visit"
          }
        />
        <Stat
          label="Exposing next month"
          value={exposing.length}
          tone={exposing.length > 0 ? "warn" : "ok"}
          detail={
            exposing.length === 0
              ? "no attributable, uncorrected cause"
              : "a second out-of-band month would reprice"
          }
        />
        <Stat label="Decided" value={rows.length - open.length} detail="closed reviews" />
      </StatRow>

      {rows.length === 0 ? (
        // FEAT-055-AC-2 — the caught-up state.
        <EmptyState title="No deviations">
          Every circuit-month calculated so far measured inside its contracted band. A review is
          raised automatically when one does not.
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Society</th>
                <th className="hidden md:table-cell">Circuit</th>
                <th>Period</th>
                <th className="text-right">Measured</th>
                <th className="hidden lg:table-cell">Coverage</th>
                <th>State</th>
                <th className="hidden sm:table-cell" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ r }) => {
                const gap = r.feeLine.coverageDays < r.feeLine.calculation.coverageOfDays;
                return (
                  <ClickableRow key={r.id} href={`/admin/billing/deviations/${r.id}`}>
                    <td>
                      <span className="font-medium">{r.feeLine.calculation.society.name}</span>
                      <p className="text-[13px] text-[var(--text-muted)] md:hidden">
                        {r.feeLine.circuit.location || r.feeLine.circuit.lightType}
                      </p>
                    </td>
                    <td className="hidden md:table-cell">
                      {r.feeLine.circuit.location || r.feeLine.circuit.lightType}
                    </td>
                    <td className="num">{r.feeLine.calculation.period}</td>
                    <td className="num text-right">
                      {r.feeLine.measuredSavingsPct.toFixed(2)}%
                      <span className="text-[var(--text-subtle)]">
                        {" "}
                        vs {r.feeLine.benchmarkSavingsPct.toFixed(0)}%
                      </span>
                    </td>
                    <td className="hidden lg:table-cell">
                      {gap ? (
                        <StatusChip tone="info">
                          {r.feeLine.coverageDays}/{r.feeLine.calculation.coverageOfDays} days
                        </StatusChip>
                      ) : (
                        <span className="text-[13px] text-[var(--text-subtle)]">Full month</span>
                      )}
                    </td>
                    <td>
                      <StatusChip
                        tone={
                          r.state === "closed"
                            ? "ok"
                            : r.state === "raised" || r.state === "assigned"
                              ? "warn"
                              : "neu"
                        }
                      >
                        {STATE_LABEL[r.state]}
                      </StatusChip>
                    </td>
                    <td className="hidden sm:table-cell text-right whitespace-nowrap" aria-hidden>
                      <span className="row-link-cue text-sm font-semibold">Open →</span>
                    </td>
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <p className="mt-4 text-[13px] text-[var(--text-muted)]">
        A decision never changes the month it is about — CON-01c is explicit that month 1 never
        adjusts. It sets what the <Link href="/admin/billing" className="underline">next month&apos;s run</Link>{" "}
        reads.
      </p>
    </>
  );
}
