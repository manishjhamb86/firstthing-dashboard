"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardTitle, EmptyState, ErrorText, Field, InfoNote, StatusChip } from "@/components/ui";
import { Modal } from "@/components/modal";
import { StarRating } from "@/components/star-rating";
import { formatDate } from "@/lib/format-date";
import {
  approveCandidate,
  decideProposal,
  proposeStarSociety,
  recordShowcaseConsent,
  rejectCandidate,
  setStarSummaryShown,
  withdrawShowcaseConsent,
  withdrawStarListing,
} from "./actions";

type Listing = {
  id: string;
  origin: "auto" | "manual";
  status: string;
  live: boolean;
  ratingStars: number | null;
  summary: string | null;
  showSummary: boolean;
  proposedBy: string | null;
  proposedById: string | null;
  proposedAt: string;
  proposalNote: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  expiresAt: string | null;
  withdrawnBy: string | null;
  withdrawnAt: string | null;
  withdrawnReason: string | null;
};

export type StarRow = {
  society: { id: string; name: string; location: string };
  stars: number | null;
  avgDaysLate: number | null;
  counted: number;
  onTimeCount: number;
  openCount: number;
  closed: boolean;
  markedDefaulter: boolean;
  candidate: boolean;
  hiddenReason: string | null;
  consent: { id: string; givenBy: string; givenOn: string; note: string | null; recordedBy: string | null } | null;
  listings: Listing[];
};

type Dialog =
  | { kind: "consent"; row: StarRow }
  | { kind: "withdrawConsent"; row: StarRow }
  | { kind: "approve"; row: StarRow }
  | { kind: "reject"; row: StarRow }
  | { kind: "propose"; row: StarRow }
  | { kind: "decide"; row: StarRow; listing: Listing; decision: "approve" | "reject" }
  | { kind: "withdrawListing"; row: StarRow; listing: Listing };

const TITLES: Record<Dialog["kind"], string> = {
  consent: "Record the committee's consent",
  withdrawConsent: "Withdraw consent",
  approve: "Show as a star partner",
  reject: "Do not show this society",
  propose: "Propose a star partner",
  decide: "Decide the proposal",
  withdrawListing: "Take off the showcase",
};

const STATUS_LABEL: Record<string, string> = {
  proposed: "Awaiting a decision",
  approved: "Approved",
  rejected: "Not shown",
  withdrawn: "Taken off",
  superseded: "Closed — facts changed",
  expired: "Expired",
};

const todayIso = () => new Date().toISOString().slice(0, 10);

export function StarSocietiesClient({
  rows,
  rule,
  viewerId,
  canApprove,
  canPropose,
}: {
  rows: StarRow[];
  rule: string[];
  viewerId: string;
  canApprove: boolean;
  canPropose: boolean;
}) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [text, setText] = useState("");
  const [givenBy, setGivenBy] = useState("");
  const [givenOn, setGivenOn] = useState(todayIso());
  const [showSummary, setShowSummary] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function open(d: Dialog) {
    setDialog(d);
    setText("");
    setGivenBy("");
    setGivenOn(todayIso());
    setShowSummary(true);
    setError(null);
  }

  function run(fn: () => Promise<{ error?: string; done?: string }>) {
    start(async () => {
      try {
        const r = await fn();
        if (r.error) setError(r.error);
        else {
          setDialog(null);
          setMessage(r.done ?? "Saved.");
        }
      } catch {
        setError("That did not go through — reload the page and try again.");
      }
    });
  }

  function submit() {
    if (!dialog) return;
    const id = dialog.row.society.id;
    switch (dialog.kind) {
      case "consent":
        return run(() => recordShowcaseConsent({ societyId: id, givenBy, givenOn, note: text }));
      case "withdrawConsent":
        return run(() => withdrawShowcaseConsent(dialog.row.consent!.id, text));
      case "approve":
        return run(() => approveCandidate(id, showSummary, text));
      case "reject":
        return run(() => rejectCandidate(id, text));
      case "propose":
        return run(() => proposeStarSociety(id, text, showSummary));
      case "decide":
        return run(() => decideProposal(dialog.listing.id, dialog.decision, text));
      case "withdrawListing":
        return run(() => withdrawStarListing(dialog.listing.id, text));
    }
  }

  function toggleSummary(listing: Listing) {
    start(async () => {
      const r = await setStarSummaryShown(listing.id, !listing.showSummary);
      if (r.error) setMessage(r.error);
    });
  }

  const candidates = rows.filter((r) => r.candidate);
  const proposals = rows.flatMap((r) => r.listings.filter((l) => l.status === "proposed").map((l) => ({ row: r, listing: l })));
  const live = rows.flatMap((r) => r.listings.filter((l) => l.live).map((l) => ({ row: r, listing: l })));
  const history = rows
    .flatMap((r) => r.listings.filter((l) => !l.live && l.status !== "proposed").map((l) => ({ row: r, listing: l })))
    .sort((a, b) => (b.listing.decidedAt ?? b.listing.proposedAt).localeCompare(a.listing.decidedAt ?? a.listing.proposedAt));
  const rated = rows.filter((r) => r.counted > 0 || r.consent || r.listings.length > 0);

  const consentCell = (r: StarRow) =>
    r.consent ? (
      <span className="text-[12.5px]">
        <StatusChip tone="ok">Consent on record</StatusChip>
        <span className="mt-1 block" style={{ color: "var(--text-subtle)" }}>
          {r.consent.givenBy}, {formatDate(new Date(r.consent.givenOn))}
        </span>
        {canPropose && (
          <button type="button" className="mt-1 text-[12px] underline" onClick={() => open({ kind: "withdrawConsent", row: r })}>
            Withdraw
          </button>
        )}
      </span>
    ) : canPropose ? (
      <button type="button" className="btn-secondary" onClick={() => open({ kind: "consent", row: r })}>
        Record consent
      </button>
    ) : (
      <StatusChip tone="warn">No consent yet</StatusChip>
    );

  const ratingCell = (r: StarRow) => (
    <span className="flex flex-col gap-0.5">
      <StarRating stars={r.stars} />
      {r.counted > 0 && (
        <span className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
          {r.onTimeCount} of {r.counted} on time
          {r.avgDaysLate !== null && ` · ${r.avgDaysLate} days late on average`}
        </span>
      )}
    </span>
  );

  return (
    <div className="flex flex-col gap-5">
      {message && (
        <p role="status" className="text-[13px]" style={{ color: "var(--ok-fg)" }}>
          {message}
        </p>
      )}

      <InfoNote label="How the payment rating works">
        <ul className="list-disc space-y-1 pl-5">
          {rule.map((line) => (
            <li key={line}>{line}</li>
          ))}
          <li>5 stars with nothing unpaid past due raises a society here for review. Once shown, it stays shown while it keeps 4 stars or more with nothing unpaid past due, and its committee&apos;s consent stands.</li>
        </ul>
      </InfoNote>

      <Card className="p-6">
        <CardTitle>Raised for review</CardTitle>
        <p className="mb-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
          Societies the system found paying on time. Approving shows one on every society&apos;s portal for 90 days.
          {!canApprove && " Approving needs the “Approve star societies” permission."}
        </p>
        {candidates.length === 0 ? (
          <EmptyState title="Nothing to review">A society appears here when it earns 5 stars with nothing unpaid past due.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Society</th>
                  <th>Payment rating</th>
                  <th>Committee consent</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {candidates.map((r) => (
                  <tr key={r.society.id}>
                    <td>
                      <Link href={`/admin/societies/${r.society.id}`} className="font-semibold">
                        {r.society.name}
                      </Link>
                      <span className="block text-[12px]" style={{ color: "var(--text-subtle)" }}>
                        {r.society.location}
                      </span>
                    </td>
                    <td>{ratingCell(r)}</td>
                    <td>{consentCell(r)}</td>
                    <td className="whitespace-nowrap text-right">
                      {canApprove && (
                        <span className="inline-flex gap-2">
                          <button type="button" className="btn-secondary" disabled={!r.consent} title={r.consent ? undefined : "Record the committee's consent first"} onClick={() => open({ kind: "approve", row: r })}>
                            Show
                          </button>
                          <button type="button" className="btn-ghost" onClick={() => open({ kind: "reject", row: r })}>
                            Not now
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {proposals.length > 0 && (
        <Card className="p-6">
          <CardTitle>Proposed by hand — awaiting a decision</CardTitle>
          <ul className="flex flex-col gap-3">
            {proposals.map(({ row, listing }) => {
              const own = listing.proposedById === viewerId;
              return (
                <li key={listing.id} className="rounded-[var(--r-md)] border p-4" style={{ borderColor: "var(--border)" }}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{row.society.name}</p>
                      <p className="text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
                        Proposed by {listing.proposedBy ?? "—"} on {formatDate(new Date(listing.proposedAt))}: {listing.proposalNote}
                      </p>
                      <div className="mt-2">{ratingCell(row)}</div>
                      <div className="mt-2">{consentCell(row)}</div>
                    </div>
                    {canApprove && (
                      <div className="flex shrink-0 gap-2">
                        {own ? (
                          <span className="text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
                            You proposed it — another admin decides.
                          </span>
                        ) : (
                          <>
                            <button type="button" className="btn-secondary" onClick={() => open({ kind: "decide", row, listing, decision: "approve" })}>
                              Approve
                            </button>
                            <button type="button" className="btn-ghost" onClick={() => open({ kind: "decide", row, listing, decision: "reject" })}>
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="p-6">
        <CardTitle>On the showcase</CardTitle>
        {live.length === 0 ? (
          <EmptyState title="No star partners yet">Approved societies appear here, and on every society&apos;s portal.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {live.map(({ row, listing }) => (
              <li key={listing.id} className="rounded-[var(--r-md)] border p-4" style={{ borderColor: "var(--border)" }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {row.society.name}
                      {row.hiddenReason ? <StatusChip tone="warn">Not shown now</StatusChip> : <StatusChip tone="ok">Shown</StatusChip>}
                    </p>
                    {row.hiddenReason && (
                      <p className="text-[12.5px]" style={{ color: "var(--warn-fg)" }}>
                        {row.hiddenReason} It reappears if that changes before {formatDate(new Date(listing.expiresAt!))}.
                      </p>
                    )}
                    <p className="text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
                      Approved by {listing.decidedBy ?? "—"} on {formatDate(new Date(listing.decidedAt!))} · until {formatDate(new Date(listing.expiresAt!))}
                      {listing.origin === "manual" && ` · proposed by ${listing.proposedBy ?? "—"}`}
                    </p>
                    <div className="mt-2">{ratingCell(row)}</div>
                    <div className="mt-2">{consentCell(row)}</div>
                    {listing.summary && (
                      <label className="mt-2 flex items-center gap-2 text-[13px]">
                        <input type="checkbox" checked={listing.showSummary} disabled={!canPropose || pending} onChange={() => toggleSummary(listing)} />
                        Show on the card: &ldquo;{listing.summary}&rdquo;
                      </label>
                    )}
                  </div>
                  {canPropose && (
                    <button type="button" className="btn-ghost shrink-0" onClick={() => open({ kind: "withdrawListing", row, listing })}>
                      Take off
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-6">
        <CardTitle>Payment ratings</CardTitle>
        <p className="mb-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
          Every society with a released invoice. For the back office only — a society sees just its own rating.
        </p>
        {rated.length === 0 ? (
          <EmptyState title="No ratings yet">A society is rated once its invoices are released and fall due.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Society</th>
                  <th>Payment rating</th>
                  <th>Unpaid past due</th>
                  <th>Committee consent</th>
                  <th>Showcase</th>
                </tr>
              </thead>
              <tbody>
                {rated.map((r) => {
                  const latest = r.listings[0];
                  const busy = r.listings.some((l) => l.live || l.status === "proposed");
                  const blocked = r.closed || r.markedDefaulter || r.openCount > 0 || (r.stars !== null && r.stars < 4);
                  return (
                    <tr key={r.society.id}>
                      <td>
                        <Link href={`/admin/societies/${r.society.id}`} className="font-semibold">
                          {r.society.name}
                        </Link>
                        {r.markedDefaulter && (
                          <span className="ml-2">
                            <StatusChip tone="bad">Defaulter</StatusChip>
                          </span>
                        )}
                      </td>
                      <td>{ratingCell(r)}</td>
                      <td className="num">{r.openCount > 0 ? <span style={{ color: "var(--bad-fg)" }}>{r.openCount}</span> : "—"}</td>
                      <td>{consentCell(r)}</td>
                      <td>
                        {latest ? (
                          <span className="text-[12.5px]">{latest.live ? "Shown" : STATUS_LABEL[latest.status] ?? latest.status}</span>
                        ) : null}
                        {canPropose && !busy && !blocked && (
                          <button type="button" className="btn-ghost ml-2" onClick={() => open({ kind: "propose", row: r })}>
                            Propose
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {history.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[13px] font-semibold">Earlier decisions ({history.length})</summary>
          <ul className="mt-3 flex flex-col gap-2 text-[13px]">
            {history.map(({ row, listing }) => (
              <li key={listing.id}>
                <strong>{row.society.name}</strong> — {STATUS_LABEL[listing.status] ?? listing.status}
                {listing.decidedAt && ` on ${formatDate(new Date(listing.decidedAt))}`}
                {listing.decidedBy && ` by ${listing.decidedBy}`}
                {(listing.withdrawnReason ?? listing.decisionNote) && (
                  <span style={{ color: "var(--text-subtle)" }}>: {listing.withdrawnReason ?? listing.decisionNote}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {dialog && (
        <Modal
          open
          onClose={() => setDialog(null)}
          title={TITLES[dialog.kind]}
          description={dialog.row.society.name}
          footer={
            <>
              <button type="button" className="btn-ghost" onClick={() => setDialog(null)} disabled={pending}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={submit} disabled={pending}>
                {pending ? "Saving…" : dialog.kind === "decide" && dialog.decision === "reject" ? "Reject" : "Confirm"}
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            {dialog.kind === "consent" && (
              <>
                <Field label="Who agreed" htmlFor="sc-given-by" hint="As they signed — name and position.">
                  <input id="sc-given-by" className="field" value={givenBy} onChange={(e) => setGivenBy(e.target.value)} />
                </Field>
                <Field label="Agreed on" htmlFor="sc-given-on">
                  <input id="sc-given-on" type="date" className="field" value={givenOn} max={todayIso()} onChange={(e) => setGivenOn(e.target.value)} />
                </Field>
              </>
            )}
            {(dialog.kind === "approve" || dialog.kind === "propose") && (
              <label className="flex items-start gap-2 text-[13px]">
                <input type="checkbox" checked={showSummary} onChange={(e) => setShowSummary(e.target.checked)} />
                <span>Show the line on the card — it is written from the payment record, for example &ldquo;Paid all 12 invoices on time since July 2025.&rdquo;</span>
              </label>
            )}
            {dialog.kind === "decide" && dialog.decision === "approve" && (
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                The facts are checked again now. If the society no longer qualifies, the proposal is closed instead.
              </p>
            )}
            <Field
              label={
                dialog.kind === "consent"
                  ? "Note (optional)"
                  : dialog.kind === "approve" || (dialog.kind === "decide" && dialog.decision === "approve")
                    ? "Note (optional)"
                    : "Reason"
              }
              htmlFor="sc-text"
            >
              <textarea id="sc-text" className="field" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
            {error && <ErrorText>{error}</ErrorText>}
          </div>
        </Modal>
      )}
    </div>
  );
}
