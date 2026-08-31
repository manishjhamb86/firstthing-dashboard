import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ListToolbar } from "@/components/list-toolbar";
import { ClickableRow } from "@/components/clickable-row";
import { Card, EmptyState, PageHeader, Stat, StatRow, StatusChip } from "@/components/ui";
import { SERVICE_LINE_LABEL } from "@/lib/status-maps";
import { requireBillingReader, canRelease, isOps } from "./access";
import { RunMonthButton } from "./run-month-button";

// MS-08 / FEAT-048 — the month's board: every society with an active
// contract, what this period's run produced, and the one action available
// on it. The period is an explicit selection (INV-04), never inferred, so
// it lives in the URL exactly as the readings area's does.
export const dynamic = "force-dynamic";

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const CALC_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "neu" | "info" }> = {
  held: { label: "Held", tone: "warn" },
  calculated: { label: "Calculated", tone: "info" },
  released: { label: "Released", tone: "ok" },
  superseded: { label: "Superseded", tone: "neu" },
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const gate = await requireBillingReader();
  if (!gate.ok) redirect("/admin");
  const { period: raw } = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(raw ?? "") ? (raw as string) : currentPeriod();

  const contracts = await db.contract.findMany({
    where: { status: "active" },
    include: { society: true },
    orderBy: [{ society: { name: "asc" } }],
  });

  const calculations = await db.monthlyCalculation.findMany({
    where: { period, societyId: { in: contracts.map((c) => c.societyId) } },
    orderBy: { version: "desc" },
    include: { feeLines: { select: { complianceResult: true } }, invoice: { select: { id: true } } },
  });

  // Only the newest version of each society+line is the live one; the rest
  // are the superseded history a re-run leaves behind (GATE-02).
  const live = new Map<string, (typeof calculations)[number]>();
  for (const c of calculations) {
    const key = `${c.societyId}:${c.serviceLine}`;
    if (!live.has(key)) live.set(key, c);
  }

  // CON-24 as amended: several contracts (parts) can run under one service
  // line, but the month is ONE combined calculation — so the board shows one
  // row per (society, line), naming its parts, not one row per contract
  // (which rendered the same run button twice for the same combined figure).
  const groups = new Map<string, (typeof contracts)[number][]>();
  for (const c of contracts) {
    const key = `${c.societyId}:${c.serviceLine}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const rows = [...groups.values()].map((group) => {
    const c = group[0];
    const calc = live.get(`${c.societyId}:${c.serviceLine}`) ?? null;
    return {
      contract: c,
      parts: group,
      calc,
      outOfBand: calc?.feeLines.filter((l) => l.complianceResult === "out_of_band").length ?? 0,
    };
  });

  const calculated = rows.filter((r) => r.calc?.status === "calculated").length;
  const heldCount = rows.filter((r) => r.calc?.status === "held").length;
  const released = rows.filter((r) => r.calc?.status === "released").length;
  const notRun = rows.filter((r) => r.calc === null).length;

  return (
    <>
      <PageHeader
        title="Billing"
        subtitle={`${period} · the month's calculation, per contract.`}
        chip={heldCount > 0 ? <StatusChip tone="warn">{heldCount} held</StatusChip> : undefined}
        action={
          isOps(gate.actor) ? (
            <Link href="/admin/billing/deviations" className="btn-outline btn-sm">
              Deviations
            </Link>
          ) : undefined
        }
      />

      <StatRow>
        <Stat
          label="Contracts billable"
          value={contracts.length}
          detail={contracts.length === 0 ? "none active yet" : "active contracts"}
        />
        <Stat label="Not yet run" value={notRun} detail={notRun === 0 ? "every contract run" : `for ${period}`} />
        <Stat
          label="Held"
          value={heldCount}
          tone={heldCount > 0 ? "warn" : "ok"}
          detail={heldCount === 0 ? "nothing blocked" : "inputs unresolved"}
        />
        <Stat
          label="Awaiting release"
          value={calculated}
          detail={released > 0 ? `${released} already released` : "accountant has not released"}
        />
      </StatRow>

      <form method="get">
        <ListToolbar>
          <input
            name="period"
            type="month"
            defaultValue={period}
            aria-label="Billing period — an explicit choice, never inferred (INV-04)"
            title="An explicit choice, never inferred from the readings (INV-04)."
            className="field field-auto"
          />
          <button type="submit" className="btn-secondary">
            Show
          </button>
        </ListToolbar>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title="No active contract yet"
          action={
            <Link href="/admin/pipeline" className="btn-ghost btn-sm">
              Open the pipeline →
            </Link>
          }
        >
          A month can only be calculated against an active contract — one is created when an
          agreement is executed.
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Society</th>
                <th className="hidden md:table-cell">Service line</th>
                <th>Status</th>
                <th className="text-right">Total</th>
                <th className="hidden lg:table-cell">Out of band</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ contract, parts, calc, outOfBand }) => {
                const meta = calc ? CALC_STATUS[calc.status] : null;
                const href = calc ? `/admin/billing/${calc.id}` : null;
                const body = (
                  <>
                    <td>
                      <span className="font-medium">{contract.society.name}</span>
                      <p className="text-[13px] text-[var(--text-muted)]">{contract.society.location}</p>
                    </td>
                    <td className="hidden md:table-cell">
                      {SERVICE_LINE_LABEL[contract.serviceLine] ?? contract.serviceLine}
                      {parts.length > 1 && (
                        <p className="text-xs text-[var(--text-subtle)]">
                          {parts.length} parts combine into one bill
                        </p>
                      )}
                    </td>
                    <td>
                      {meta ? (
                        <StatusChip tone={meta.tone}>
                          {meta.label}
                          {calc && calc.version > 1 ? ` · v${calc.version}` : ""}
                        </StatusChip>
                      ) : (
                        <span className="text-[13px] text-[var(--text-subtle)]">Not run</span>
                      )}
                    </td>
                    <td className="num text-right">
                      {calc && calc.status !== "held"
                        ? `₹${calc.total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : "—"}
                    </td>
                    <td className="hidden lg:table-cell">
                      {calc === null || calc.status === "held" ? (
                        <span className="text-[var(--text-subtle)]">—</span>
                      ) : outOfBand > 0 ? (
                        <StatusChip tone="warn">{outOfBand} circuit{outOfBand === 1 ? "" : "s"}</StatusChip>
                      ) : (
                        <StatusChip tone="ok">All in band</StatusChip>
                      )}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {isOps(gate.actor) && calc?.status !== "released" ? (
                        <RunMonthButton
                          societyId={contract.societyId}
                          serviceLine={contract.serviceLine}
                          period={period}
                          rerun={calc !== null}
                        />
                      ) : href ? (
                        <span className="row-link-cue text-sm font-semibold" aria-hidden>
                          Open →
                        </span>
                      ) : null}
                    </td>
                  </>
                );
                return href ? (
                  <ClickableRow key={contract.id} href={href}>
                    {body}
                  </ClickableRow>
                ) : (
                  <tr key={contract.id}>{body}</tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {!canRelease(gate.actor) && !isOps(gate.actor) && (
        <p className="mt-4 text-[13px] text-[var(--text-muted)]">
          You can read this area but not act in it.
        </p>
      )}
    </>
  );
}
