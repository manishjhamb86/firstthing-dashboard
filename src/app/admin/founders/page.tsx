import type { ReactNode } from "react";
import Link from "next/link";
import { Receipt, Zap, HardHat, LifeBuoy, Activity } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-permissions";
import { Card, CardTitle, EmptyState, PageHeader, Stat, StatRow, StatusChip } from "@/components/ui";
import { DAY_GATE_STATUS } from "@/lib/status-maps";
import { ticketLateness, meterAlertLateness, type LatenessTone } from "@/lib/lateness";
import { paymentSummary, installationBoard, demoBoard, type PaymentSummary, type InstallationRow, type DemoBoard } from "@/lib/founder-dashboard-loaders";
import { YourTasks } from "../your-tasks";
import { logger } from "@/lib/logger";

// Five domains, five colours (2026-10-23, user-asked: "use more colours so
// things are easily distinguishable... should look classic and beautiful
// and distinct"). This deliberately departs from the rest of the app's own
// standing rule that a Stat's number is tinted only when it needs attention
// (see ui.tsx's own STAT_TONE comment) — that rule is about a FIGURE'S
// severity, which is untouched here; this is a CATEGORY colour, answering
// "which of the five domains is this", a different question the app has
// never needed answered before this exec-only page.
//
// A first pass here reused the app's own ok/warn/bad/info status tones —
// researched afterward (docs/research/reports/Dashboard card colour
// design.md) once the result read as barely different from before, and
// that research names the exact mistake: those four tones are deliberately
// pale and meant for a rare callout, so repainting them at card scale for
// five PERMANENT labels mostly reproduced the same subtle pastels; and
// reusing a STATUS hue (ok=green/"fine", bad=red/"wrong") as a CATEGORY
// label is the one thing every source in that research converges on
// avoiding — the same colour meaning two different things on one screen.
// Four hues are now genuinely new (--cyan-*/--purple-*/--pink-*/--violet-*
// plus their .chip-* classes in globals.css); Payments is the one
// exception, and deliberately so — it takes the product's own primary
// brand accent (.chip-accent, also new) rather than a sixth invented hue,
// since it is the single most central domain on this page. Kept local to
// this page rather than widening the shared ChipTone union, which two
// other files exhaustively switch over — a sixth tone there would force an
// unrelated case onto both.
const CATEGORY = {
  // Payments gets the product's own primary brand colour — the most
  // central domain in its own accent, not a sixth invented hue.
  payments: { icon: Receipt, chip: "chip-accent", bg: "var(--accent-subtle)", fg: "var(--accent)" },
  meters: { icon: Zap, chip: "chip-cyan", bg: "var(--cyan-bg)", fg: "var(--cyan-fg)" },
  installations: { icon: HardHat, chip: "chip-purple", bg: "var(--purple-bg)", fg: "var(--purple-fg)" },
  complaints: { icon: LifeBuoy, chip: "chip-pink", bg: "var(--pink-bg)", fg: "var(--pink-fg)" },
  demos: { icon: Activity, chip: "chip-violet", bg: "var(--violet-bg)", fg: "var(--violet-fg)" },
} as const;

type Domain = keyof typeof CATEGORY;

function CategoryBadge({ domain }: { domain: Domain }) {
  const { icon: Icon, bg, fg } = CATEGORY[domain];
  return (
    <span
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-sm)]"
      style={{ background: bg, color: fg }}
      aria-hidden
    >
      <Icon size={16} strokeWidth={2.25} />
    </span>
  );
}

function CategoryPill({ domain, children }: { domain: Domain; children: ReactNode }) {
  return (
    <span className={`chip ${CATEGORY[domain].chip}`}>
      <span className="chip-dot" aria-hidden />
      {children}
    </span>
  );
}

/** Card, with a left accent border in its domain's own colour. */
function CatCard({ id, domain, className, children }: { id?: string; domain: Domain; className?: string; children: ReactNode }) {
  return (
    <div id={id} className={`card ${className ?? ""}`} style={{ borderLeftWidth: 4, borderLeftColor: CATEGORY[domain].fg }}>
      {children}
    </div>
  );
}

function CatLink({ domain, href, children }: { domain: Domain; href: string; children: ReactNode }) {
  return (
    <Link href={href} className="mt-4 inline-block text-[13px] font-semibold underline" style={{ color: CATEGORY[domain].fg }}>
      {children}
    </Link>
  );
}

// The founders' "what is not on time" page (2026-10-22,
// docs/research/reports/Founder operations dashboard.md). A dedicated route
// rather than extending Portfolio — Portfolio already runs 13 reads every
// admin pays for on every visit, and this page's payment aggregates,
// installation board and demo facts are reads nobody else needs.
//
// Gated by its own named permission (view_founder_dashboard) rather than a
// second hard-wired email like isSuperAdmin, whose own comment says that is
// "not a general pattern" — granted to whoever should see it from
// /admin/users, the same way approve_showcase already is. This page reads
// billing, meter and ticket data whose own pages have narrower gates — that
// is a deliberate decision, recorded here and in the research report, not an
// accidental widening.

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

type LateRow = {
  tone: LatenessTone | "bad" | "warn";
  domain: Domain;
  kind: string;
  societyName: string;
  itemLabel: string;
  clock: string;
  href: string;
  actionLabel: string;
};

const TONE_CHIP: Record<string, "ok" | "warn" | "bad"> = { ok: "ok", amber: "warn", red: "bad", warn: "warn", bad: "bad" };

const EMPTY_PAYMENTS: PaymentSummary = {
  receivedThisMonth: 0,
  outstandingTotal: 0,
  buckets: { notYetDue: 0, d1to15: 0, d16to30: 0, d31to45: 0, over45: 0 },
  overdueInvoices: [],
  topOverdueSocieties: [],
  retail: { unpaidCount: 0, owed: 0 },
};
const EMPTY_INSTALLATIONS: InstallationRow[] = [];
const EMPTY_DEMOS: DemoBoard = { reviews: [], delays: [], stepCounts: { preWindow: 0, awaitingReplacement: 0, postWindow: 0, reviewOpen: 0 } };

type TicketRow = { id: string; type: string; status: "open" | "in_progress" | "resolved"; subject: string; createdAt: Date; society: { name: string } };
type MeterAlertRow = {
  id: string;
  kind: string;
  message: string;
  openedAt: Date;
  acknowledgedAt: Date | null;
  meter: { name: string; society: { name: string } | null; owner: { name: string | null; email: string } | null } | null;
  circuit: { society: { name: string } } | null;
};

export default async function FoundersPage() {
  const session = await requireAdminPage("view_founder_dashboard");
  const now = new Date();

  // Each card is its own concern (INV-06's error/degraded states, the
  // handoff plan's own checklist item: "each card degrades independently
  // when its query fails") — allSettled rather than all, so one query
  // throwing (a demo circuit with a shape this page's own read did not
  // expect, say) loses that one card's rows, not the whole page.
  const [paymentsR, installationsR, demosR, ticketsR, metersR] = await Promise.allSettled([
    paymentSummary(now),
    installationBoard(now),
    demoBoard(now),
    db.ticket.findMany({
      where: { status: { not: "resolved" }, type: { not: "enquiry" } },
      select: { id: true, type: true, status: true, subject: true, createdAt: true, society: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }) as Promise<TicketRow[]>,
    db.meterAlert.findMany({
      where: { closedAt: null },
      select: {
        id: true,
        kind: true,
        message: true,
        openedAt: true,
        acknowledgedAt: true,
        meter: { select: { name: true, society: { select: { name: true } }, owner: { select: { name: true, email: true } } } },
        circuit: { select: { society: { select: { name: true } } } },
      },
      orderBy: { openedAt: "asc" },
    }) as Promise<MeterAlertRow[]>,
  ]);

  const settle = <T,>(r: PromiseSettledResult<T>, fallback: T, card: string): T => {
    if (r.status === "fulfilled") return r.value;
    logger.error("founders_dashboard.card_failed", { card, error: String(r.reason) });
    return fallback;
  };

  const payments = settle(paymentsR, EMPTY_PAYMENTS, "payments");
  const installations = settle(installationsR, EMPTY_INSTALLATIONS, "installations");
  const demos = settle(demosR, EMPTY_DEMOS, "demos");
  const openTickets = settle(ticketsR, [], "complaints");
  const openMeterAlerts = settle(metersR, [], "meters");

  const failedCards = new Set(
    [
      paymentsR.status === "rejected" && "payments",
      installationsR.status === "rejected" && "installations",
      demosR.status === "rejected" && "demos",
      ticketsR.status === "rejected" && "complaints",
      metersR.status === "rejected" && "meters",
    ].filter((x): x is string => x !== false),
  );

  // --- Build the merged "Not on time" list -----------------------------
  const rows: LateRow[] = [];

  for (const s of payments.topOverdueSocieties) {
    rows.push({
      tone: s.oldestDays >= 15 ? "red" : "amber",
      domain: "payments",
      kind: "Payment",
      societyName: s.societyName,
      itemLabel: `${s.count} invoice${s.count === 1 ? "" : "s"} overdue, oldest ${s.oldestDays}d`,
      clock: `${rupees(s.outstanding)} outstanding`,
      href: "#payments",
      actionLabel: "Chase",
    });
  }

  for (const t of openTickets) {
    const l = ticketLateness({ status: t.status, createdAt: t.createdAt, now });
    if (!l) continue;
    rows.push({
      tone: l.tone,
      domain: "complaints",
      kind: t.type === "device_replacement" ? "Replacement" : t.type === "pickup" ? "Pickup" : "Complaint",
      societyName: t.society.name,
      itemLabel: t.subject,
      clock: l.clock,
      href: "#complaints",
      actionLabel: "Open",
    });
  }

  for (const inst of installations) {
    // One row per project, not one per held day: a day blocked only because
    // an EARLIER day hasn't started yet carries no information of its own —
    // evaluateDayGateChain cascades the identical "days run in order" reason
    // onto every day after the real cause (ascending by day, so [0] is it).
    // The count past it is kept, so "4 days held" doesn't silently become
    // "1 day held".
    const [first, ...rest] = inst.heldDays;
    if (!first) continue;
    rows.push({
      tone: first.status === "blocked" ? "bad" : "warn",
      domain: "installations",
      kind: "Installation",
      societyName: inst.societyName,
      // The chip (below) is the short status word, matching every other row
      // kind — the full sentence belongs in the wrapping Item cell, not in a
      // `white-space: nowrap` chip, which is what ran text off the table.
      itemLabel: `Day ${first.day}${first.reason ? ` — ${first.reason}` : ""}${rest.length > 0 ? ` (${rest.length} more day${rest.length === 1 ? "" : "s"} waiting on it)` : ""}`,
      clock: DAY_GATE_STATUS[first.status]?.label ?? first.status,
      href: `/admin/pipeline/${inst.pipelineId}/installation`,
      actionLabel: "Review",
    });
  }

  for (const a of openMeterAlerts) {
    const l = meterAlertLateness({ kind: a.kind, openedAt: a.openedAt, acknowledgedAt: a.acknowledgedAt, now });
    const societyName = a.meter?.society?.name ?? a.circuit?.society?.name ?? "—";
    rows.push({
      tone: l.tone,
      domain: "meters",
      kind: "Meter",
      societyName,
      // a.message is already the complete, self-naming sentence
      // (outageMessage()/evaluateCapacity()/the band check all lead with the
      // meter or circuit's own name) — prefixing a second copy of that same
      // name read as "X — X on Y is not reachable".
      itemLabel: a.message,
      clock: l.clock,
      href: "#meters",
      actionLabel: a.meter?.owner ? `Chase ${a.meter.owner.name ?? a.meter.owner.email}` : "Assign",
    });
  }

  for (const r of demos.reviews) {
    rows.push({
      tone: r.urgency.tone,
      domain: "demos",
      kind: "Demo review",
      societyName: r.societyName,
      itemLabel: r.circuitLabel,
      clock: r.urgency.label,
      href: "/admin/demo-monitoring",
      actionLabel: "Resolve",
    });
  }
  for (const d of demos.delays) {
    rows.push({
      tone: d.lateness.tone,
      domain: "demos",
      kind: d.kind === "replacement" ? "Demo replacement" : "Demo window",
      societyName: d.societyName,
      itemLabel: d.circuitLabel,
      clock: d.lateness.clock,
      href: "/admin/demo-monitoring",
      actionLabel: "Open",
    });
  }

  const toneRank = (t: LateRow["tone"]) => (t === "red" || t === "bad" ? 0 : 1);
  rows.sort((a, b) => toneRank(a.tone) - toneRank(b.tone));

  const redCount = rows.filter((r) => toneRank(r.tone) === 0).length;

  const summaryParts = [
    payments.overdueInvoices.length > 0 ? `${payments.overdueInvoices.length} invoice${payments.overdueInvoices.length === 1 ? "" : "s"} overdue` : null,
    openMeterAlerts.length > 0 ? `${openMeterAlerts.length} meter issue${openMeterAlerts.length === 1 ? "" : "s"}` : null,
    installations.some((i) => i.heldDays.length > 0)
      ? `${installations.reduce((n, i) => n + i.heldDays.length, 0)} installation day${installations.reduce((n, i) => n + i.heldDays.length, 0) === 1 ? "" : "s"} held up`
      : null,
    openTickets.length > 0 ? `${openTickets.length} open ticket${openTickets.length === 1 ? "" : "s"}` : null,
    demos.reviews.length + demos.delays.length > 0 ? `${demos.reviews.length + demos.delays.length} demo item${demos.reviews.length + demos.delays.length === 1 ? "" : "s"}` : null,
  ].filter((x): x is string => x !== null);

  return (
    <div>
      <PageHeader
        title="Founders' page"
        subtitle="What is not on time, across payments, meters, installations, complaints and demos."
        chip={
          rows.length > 0 ? (
            <StatusChip tone={redCount > 0 ? "bad" : "warn"}>{rows.length} not on time</StatusChip>
          ) : (
            <StatusChip tone="ok">All clear</StatusChip>
          )
        }
      />

      {/* Collapsed by default, a click away (user's call, 2026-10-23: "keep
          the listing separate and only show the summary... user can choose
          to click and open the list"). Native <details>, same hook-free,
          Server-Component-renderable pattern StepSection's own done-step
          toggle uses — the summary line IS the clickable trigger, not a
          caption above it. */}
      <Card className="mb-6 p-0">
        {rows.length === 0 ? (
          <div className="p-5">
            <CardTitle>Not on time</CardTitle>
            <div className="mt-3">
              <EmptyState title="Nothing is late">Every tracked item is inside its own deadline.</EmptyState>
            </div>
          </div>
        ) : (
          <details className="group">
            <summary className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 p-5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
              <div className="min-w-0">
                <CardTitle>Not on time</CardTitle>
                <p className="mt-1 text-[14px] text-[var(--text-subtle)]">{summaryParts.join(" · ")}</p>
              </div>
              <span
                className="shrink-0 rounded-[var(--r-sm)] px-2.5 py-1 text-xs font-medium"
                style={{ background: "var(--surface-sunken)", color: "var(--text-muted)" }}
              >
                <span className="group-open:hidden">View the list</span>
                <span className="hidden group-open:inline">Close</span>
              </span>
            </summary>
            <div className="overflow-x-auto border-t" style={{ borderColor: "var(--border-subtle)" }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Society</th>
                    <th>Item</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="whitespace-nowrap">
                        <CategoryPill domain={r.domain}>{r.kind}</CategoryPill>
                      </td>
                      <td className="whitespace-nowrap font-medium">{r.societyName}</td>
                      <td className="min-w-0">{r.itemLabel}</td>
                      <td className="whitespace-nowrap">
                        <StatusChip tone={TONE_CHIP[r.tone] ?? "warn"}>{r.clock}</StatusChip>
                      </td>
                      <td className="whitespace-nowrap">
                        <Link href={r.href} className="text-[13px] font-semibold underline">
                          {r.actionLabel}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </Card>

      <div className="mb-6">
        <CardTitle className="mb-2">My meetings</CardTitle>
        <YourTasks userId={session.user.id} />
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <CatCard id="payments" domain="payments" className="min-w-0 p-5">
          <div className="mb-4 flex items-center gap-2.5">
            <CategoryBadge domain="payments" />
            <CardTitle className="mb-0">Payments</CardTitle>
          </div>
          {failedCards.has("payments") && (
            <p className="mb-3 text-[13px]" style={{ color: "var(--bad-fg)" }}>
              Couldn&apos;t load this card&apos;s figures just now — the rest of the page is unaffected. Try reloading.
            </p>
          )}
          <StatRow>
            <Stat label="Received this month" value={rupees(payments.receivedThisMonth)} />
            <Stat label="Outstanding" value={rupees(payments.outstandingTotal)} tone={payments.outstandingTotal > 0 ? "warn" : "accent"} />
            <Stat
              label="Overdue"
              value={payments.overdueInvoices.length}
              tone={payments.overdueInvoices.length > 0 ? "bad" : "accent"}
              detail={rupees(payments.overdueInvoices.reduce((n, r) => n + r.outstanding, 0))}
            />
          </StatRow>
          <p className="mt-4 mb-2 text-[12.5px] font-semibold uppercase tracking-[0.04em] text-[var(--text-subtle)]">Aging</p>
          <div className="space-y-1 text-[13px]">
            <div className="flex justify-between"><span>Not yet due</span><span className="num">{rupees(payments.buckets.notYetDue)}</span></div>
            <div className="flex justify-between"><span>1–15 days</span><span className="num">{rupees(payments.buckets.d1to15)}</span></div>
            <div className="flex justify-between"><span>16–30 days</span><span className="num">{rupees(payments.buckets.d16to30)}</span></div>
            <div className="flex justify-between"><span>31–45 days</span><span className="num">{rupees(payments.buckets.d31to45)}</span></div>
            <div className="flex justify-between"><span>Over 45 days</span><span className="num">{rupees(payments.buckets.over45)}</span></div>
          </div>
          {payments.topOverdueSocieties.length > 0 && (
            <>
              <p className="mt-4 mb-2 text-[12.5px] font-semibold uppercase tracking-[0.04em] text-[var(--text-subtle)]">Top overdue societies</p>
              <ul className="space-y-1 text-[13px]">
                {payments.topOverdueSocieties.map((s) => (
                  <li key={s.societyId} className="flex justify-between gap-2">
                    <span className="truncate">{s.societyName}</span>
                    <span className="num shrink-0">{rupees(s.outstanding)} · {s.oldestDays}d</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {payments.retail.unpaidCount > 0 && (
            <p className="mt-3 text-[12.5px] text-[var(--text-subtle)]">
              Plus {payments.retail.unpaidCount} unpaid retail invoice{payments.retail.unpaidCount === 1 ? "" : "s"} ({rupees(payments.retail.owed)}) — a separate ledger.
            </p>
          )}
          <CatLink domain="payments" href="/admin/billing/release-queue">
            Release queue →
          </CatLink>
        </CatCard>

        <CatCard id="meters" domain="meters" className="min-w-0 p-5">
          <div className="mb-4 flex items-center gap-2.5">
            <CategoryBadge domain="meters" />
            <CardTitle className="mb-0">Meters</CardTitle>
          </div>
          {failedCards.has("meters") && (
            <p className="mb-3 text-[13px]" style={{ color: "var(--bad-fg)" }}>
              Couldn&apos;t load this card&apos;s figures just now — the rest of the page is unaffected. Try reloading.
            </p>
          )}
          <p className="mb-3 text-[14px]">
            {openMeterAlerts.length === 0 ? "No open alerts." : `${openMeterAlerts.length} open alert${openMeterAlerts.length === 1 ? "" : "s"}.`}
          </p>
          {openMeterAlerts.length === 0 ? (
            <EmptyState title="All reporting">No open meter alerts right now.</EmptyState>
          ) : (
            <ul className="space-y-2 text-[13px]">
              {openMeterAlerts.slice(0, 8).map((a) => {
                const l = meterAlertLateness({ kind: a.kind, openedAt: a.openedAt, acknowledgedAt: a.acknowledgedAt, now });
                return (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    {/* a.message already names the meter/circuit and its
                        society — no separate prefix needed, see the merged
                        list above for the duplication this was producing. */}
                    <span className="min-w-0 truncate">{a.message}</span>
                    <StatusChip tone={TONE_CHIP[l.tone]}>{l.clock}</StatusChip>
                  </li>
                );
              })}
            </ul>
          )}
          <CatLink domain="meters" href="/admin/notifications">
            Notification centre →
          </CatLink>
        </CatCard>

        <CatCard id="installations" domain="installations" className="min-w-0 p-5">
          <div className="mb-4 flex items-center gap-2.5">
            <CategoryBadge domain="installations" />
            <CardTitle className="mb-0">Installations</CardTitle>
          </div>
          {failedCards.has("installations") && (
            <p className="mb-3 text-[13px]" style={{ color: "var(--bad-fg)" }}>
              Couldn&apos;t load this card&apos;s figures just now — the rest of the page is unaffected. Try reloading.
            </p>
          )}
          {installations.length === 0 ? (
            <EmptyState title="Nothing active">No installation projects are currently running.</EmptyState>
          ) : (
            <ul className="space-y-2 text-[13px]">
              {installations.map((inst) => (
                <li key={inst.projectId} className="flex items-center justify-between gap-2">
                  <Link href={`/admin/pipeline/${inst.pipelineId}/installation`} className="min-w-0 truncate underline">
                    {inst.societyName}
                  </Link>
                  <span className="num shrink-0 text-[var(--text-subtle)]">
                    {inst.installedCount}/{inst.contractedCount}
                    {inst.heldDays.length > 0 && (
                      <StatusChip tone={inst.heldDays.some((h) => h.status === "blocked") ? "bad" : "warn"}>
                        {inst.heldDays.length} held
                      </StatusChip>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CatCard>

        <CatCard id="complaints" domain="complaints" className="min-w-0 p-5">
          <div className="mb-4 flex items-center gap-2.5">
            <CategoryBadge domain="complaints" />
            <CardTitle className="mb-0">Complaints</CardTitle>
          </div>
          {failedCards.has("complaints") && (
            <p className="mb-3 text-[13px]" style={{ color: "var(--bad-fg)" }}>
              Couldn&apos;t load this card&apos;s figures just now — the rest of the page is unaffected. Try reloading.
            </p>
          )}
          {openTickets.length === 0 ? (
            <EmptyState title="Nothing open">No open complaints or replacement/pickup requests.</EmptyState>
          ) : (
            <ul className="space-y-2 text-[13px]">
              {openTickets.slice(0, 8).map((t) => {
                const l = ticketLateness({ status: t.status, createdAt: t.createdAt, now });
                return (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{t.society.name}</span> — {t.subject}
                    </span>
                    {l ? <StatusChip tone={TONE_CHIP[l.tone]}>{l.clock}</StatusChip> : <StatusChip tone="ok">{t.status === "in_progress" ? "In progress" : "Open"}</StatusChip>}
                  </li>
                );
              })}
            </ul>
          )}
          <CatLink domain="complaints" href="/admin/tickets">
            Support desk →
          </CatLink>
        </CatCard>

        <CatCard id="demos" domain="demos" className="min-w-0 p-5 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2.5">
            <CategoryBadge domain="demos" />
            <CardTitle className="mb-0">Demos</CardTitle>
          </div>
          {failedCards.has("demos") && (
            <p className="mb-3 text-[13px]" style={{ color: "var(--bad-fg)" }}>
              Couldn&apos;t load this card&apos;s figures just now — the rest of the page is unaffected. Try reloading.
            </p>
          )}
          <StatRow>
            <Stat label="Pre-install window open" value={demos.stepCounts.preWindow} />
            <Stat label="Awaiting replacement" value={demos.stepCounts.awaitingReplacement} />
            <Stat label="Post-install window open" value={demos.stepCounts.postWindow} />
            <Stat label="Reviews open" value={demos.stepCounts.reviewOpen} tone={demos.stepCounts.reviewOpen > 0 ? "warn" : "accent"} />
          </StatRow>
          <CatLink domain="demos" href="/admin/demo-monitoring">
            Demo monitoring →
          </CatLink>
        </CatCard>
      </div>
    </div>
  );
}
