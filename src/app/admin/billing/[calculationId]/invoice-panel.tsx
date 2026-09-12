"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardTitle, ErrorText, StatusChip } from "@/components/ui";
import { formatDate } from "@/lib/format-date";
import {
  acknowledgeMismatch,
  attachInvoice,
  getInvoiceDownloadUrl,
  getInvoiceUploadUrl,
  recordPayment,
  releaseCalculation,
  voidInvoiceAttachment,
} from "./invoice-actions";

export type InvoiceState = {
  id: string;
  number: string;
  issueDate: string;
  dueDate: string;
  amount: number;
  computedAmount: number;
  reconciliationStatus: "unchecked" | "matched" | "mismatched" | "acknowledged";
  status: "attached" | "released" | "overdue" | "warning" | "suspended" | "paid";
  fileName: string;
  paidTotal: number;
} | null;

const rupees = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const RECON_META: Record<string, { label: string; tone: "ok" | "warn" | "bad" }> = {
  unchecked: { label: "Not yet checked", tone: "warn" },
  matched: { label: "Matches our figure", tone: "ok" },
  mismatched: { label: "Doesn't match — needs acknowledging", tone: "bad" },
  acknowledged: { label: "Mismatch acknowledged", tone: "warn" },
};

const STATUS_META: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "info" }> = {
  attached: { label: "Attached — not yet released", tone: "info" },
  released: { label: "Pending payment", tone: "warn" },
  overdue: { label: "Overdue", tone: "bad" },
  warning: { label: "Overdue — warning stage", tone: "bad" },
  suspended: { label: "Suspended", tone: "bad" },
  paid: { label: "Paid", tone: "ok" },
};

/**
 * FEAT-053 — attach the Zoho invoice, acknowledge a mismatch if there is
 * one, release once nothing is outstanding, then record a payment. One
 * panel because these are sequential facts about one artefact, not four
 * independent screens.
 */
export type VoidedInvoice = {
  id: string;
  number: string;
  amount: number;
  voidedAt: string;
  voidedBy: string;
  voidReason: string;
};

export function InvoicePanel({
  calculationId,
  invoice,
  canRelease,
  releaseBlockedReason,
  isOps,
  voidedInvoices,
}: {
  calculationId: string;
  invoice: InvoiceState;
  /** Whether the viewer holds PER-08 (the accountant) — release is offered
   *  to no one else, including ops (CON-33). */
  canRelease: boolean;
  /** Computed server-side from the same refuseRelease() the action itself
   *  calls — a screen stating what is missing rather than a button that
   *  silently does nothing. Null means release is genuinely available. */
  releaseBlockedReason: string | null;
  isOps: boolean;
  /** Never hidden (2026-09-12) — a voided attach is a real fact about this
   *  month, the same "struck through, not erased" rule every other soft
   *  delete in this codebase follows. */
  voidedInvoices: VoidedInvoice[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Attach form
  const [number, setNumber] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);

  // Void
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");

  // Mismatch acknowledgement
  const [ackNote, setAckNote] = useState("");
  const [ackOpen, setAckOpen] = useState(false);

  // Payment
  const [payAmount, setPayAmount] = useState(invoice ? String(invoice.amount - invoice.paidTotal) : "");
  const [payDate, setPayDate] = useState("");
  const [payRef, setPayRef] = useState("");

  function submitAttach() {
    setError(null);
    if (!file) return setError("Choose the invoice PDF first.");
    if (!number || !issueDate || !dueDate || !amount) return setError("Every field is required.");
    startTransition(async () => {
      const presign = await getInvoiceUploadUrl({
        calculationId,
        fileName: file.name,
        contentType: file.type || "application/pdf",
      });
      if ("error" in presign) return setError(presign.error);
      const put = await fetch(presign.uploadUrl, { method: "PUT", body: file });
      if (!put.ok) return setError("The upload to storage failed — try again.");
      const result = await attachInvoice({
        calculationId,
        number,
        issueDate,
        dueDate,
        amount: Number(amount),
        s3Key: presign.key,
        fileName: file.name,
      });
      if (result.error) return setError(result.error);
      setNotice(
        result.reconciliation === "mismatched"
          ? "Attached — but the amount doesn't match our own figure. Acknowledge the difference below before releasing."
          : "Invoice attached and matches our computed total.",
      );
      router.refresh();
    });
  }

  function submitVoid() {
    setError(null);
    startTransition(async () => {
      const result = await voidInvoiceAttachment({ calculationId, reason: voidReason });
      if (result.error) return setError(result.error);
      setVoidOpen(false);
      setVoidReason("");
      setNotice("Voided — attach the corrected invoice below.");
      router.refresh();
    });
  }

  function submitAck() {
    setError(null);
    startTransition(async () => {
      const result = await acknowledgeMismatch({ calculationId, note: ackNote });
      if (result.error) return setError(result.error);
      setAckOpen(false);
      setAckNote("");
      router.refresh();
    });
  }

  function submitRelease() {
    setError(null);
    startTransition(async () => {
      const result = await releaseCalculation(calculationId);
      if (result.error) return setError(result.error);
      setNotice("Released.");
      router.refresh();
    });
  }

  function submitPayment() {
    setError(null);
    if (!payAmount || !payDate) return setError("Amount and confirmed-as-of date are both required.");
    startTransition(async () => {
      const result = await recordPayment({
        calculationId,
        amount: Number(payAmount),
        confirmedAsOf: payDate,
        reference: payRef,
      });
      if (result.error) return setError(result.error);
      setNotice("Payment recorded.");
      setPayRef("");
      router.refresh();
    });
  }

  async function downloadInvoice() {
    setError(null);
    const result = await getInvoiceDownloadUrl(calculationId);
    if ("error" in result) return setError(result.error);
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  return (
    <Card className="mb-6 p-6">
      <CardTitle>Invoice</CardTitle>
      {error && (
        <div className="mb-3">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
      {notice && (
        <p className="mb-3 text-[13px]" style={{ color: "var(--ok-fg)" }}>
          {notice}
        </p>
      )}

      {!invoice ? (
        isOps ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block" htmlFor="inv-number">
              <span className="lbl">Invoice number</span>
              <input
                id="inv-number"
                className="field mt-1"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="FT/2026-27/055"
                disabled={pending}
              />
            </label>
            <label className="block" htmlFor="inv-amount">
              <span className="lbl">Total amount (₹, as printed — GST included)</span>
              <input
                id="inv-amount"
                type="number"
                step="0.01"
                className="field mt-1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={pending}
              />
            </label>
            <label className="block" htmlFor="inv-issue">
              <span className="lbl">Invoice date</span>
              <input
                id="inv-issue"
                type="date"
                className="field mt-1"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                disabled={pending}
              />
            </label>
            <label className="block" htmlFor="inv-due">
              <span className="lbl">Due date</span>
              <input
                id="inv-due"
                type="date"
                className="field mt-1"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={pending}
              />
            </label>
            <label className="block sm:col-span-2" htmlFor="inv-file">
              <span className="lbl">The PDF, as generated in Zoho</span>
              <input
                id="inv-file"
                type="file"
                accept="application/pdf"
                className="field mt-1"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={pending}
              />
            </label>
            <div className="sm:col-span-2">
              <button type="button" className="btn-primary" disabled={pending} onClick={submitAttach}>
                {pending ? "Attaching…" : "Attach invoice"}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No invoice attached yet — attaching one is an operations-lead action.
          </p>
        )
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="lbl">Invoice</p>
              <p className="text-[15px] font-semibold">
                {invoice.number} · {rupees(invoice.amount)}
              </p>
              <p className="text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
                Issued {formatDate(invoice.issueDate)} · due {formatDate(invoice.dueDate)}
              </p>
              <button type="button" className="mt-1 text-[12.5px] font-semibold underline" onClick={downloadInvoice}>
                View the PDF
              </button>
            </div>
            <div>
              <p className="lbl">Against our own figure</p>
              <p>
                <StatusChip tone={RECON_META[invoice.reconciliationStatus].tone}>
                  {RECON_META[invoice.reconciliationStatus].label}
                </StatusChip>
              </p>
              <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
                We computed {rupees(invoice.computedAmount)} pre-tax — the invoice should read close to
                that plus 18% GST.
              </p>
            </div>
            <div>
              <p className="lbl">Status</p>
              <p>
                <StatusChip tone={STATUS_META[invoice.status].tone}>{STATUS_META[invoice.status].label}</StatusChip>
              </p>
              {invoice.paidTotal > 0 && (
                <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
                  {rupees(invoice.paidTotal)} recorded against it so far.
                </p>
              )}
            </div>
          </div>

          {invoice.reconciliationStatus === "mismatched" && isOps && (
            <div className="mb-4 rounded-[var(--r-md)] border p-4" style={{ borderColor: "var(--bad-line)", background: "var(--bad-bg)" }}>
              {!ackOpen ? (
                <button type="button" className="btn-secondary" onClick={() => setAckOpen(true)}>
                  Acknowledge the mismatch
                </button>
              ) : (
                <div className="space-y-2">
                  <label className="block" htmlFor="ack-note">
                    <span className="lbl">Why the amounts differ</span>
                    <input
                      id="ack-note"
                      className="field mt-1"
                      value={ackNote}
                      onChange={(e) => setAckNote(e.target.value)}
                      placeholder="A minimum-billing clause applied this month."
                      disabled={pending}
                    />
                  </label>
                  <div className="flex gap-2">
                    <button type="button" className="btn-primary" disabled={pending} onClick={submitAck}>
                      {pending ? "Saving…" : "Acknowledge"}
                    </button>
                    <button type="button" className="btn-outline" disabled={pending} onClick={() => setAckOpen(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {invoice.status === "attached" && (
            <div className="border-t pt-4" style={{ borderColor: "var(--border-subtle)" }}>
              {canRelease ? (
                releaseBlockedReason ? (
                  <p className="text-[13px]" style={{ color: "var(--warn-fg)" }}>
                    Not ready to release — {releaseBlockedReason}
                  </p>
                ) : (
                  <button type="button" className="btn-primary" disabled={pending} onClick={submitRelease}>
                    {pending ? "Releasing…" : "Release to the society"}
                  </button>
                )
              ) : (
                <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                  Releasing a month is the accountant&apos;s act (CON-33) — ops permissions do not confer it.
                </p>
              )}
            </div>
          )}

          {invoice.status === "attached" && isOps && (
            <div className="border-t pt-4" style={{ borderColor: "var(--border-subtle)" }}>
              {!voidOpen ? (
                <button type="button" className="btn-ghost" onClick={() => setVoidOpen(true)}>
                  Void this invoice — it was filed in error
                </button>
              ) : (
                <div className="space-y-2">
                  <label className="block" htmlFor="void-reason">
                    <span className="lbl">Why is this being voided</span>
                    <input
                      id="void-reason"
                      className="field mt-1"
                      value={voidReason}
                      onChange={(e) => setVoidReason(e.target.value)}
                      placeholder="Wrong month attached by mistake."
                      disabled={pending}
                    />
                  </label>
                  <div className="flex gap-2">
                    <button type="button" className="btn-secondary" disabled={pending} onClick={submitVoid}>
                      {pending ? "Voiding…" : "Confirm void"}
                    </button>
                    <button type="button" className="btn-outline" disabled={pending} onClick={() => setVoidOpen(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {invoice.status !== "attached" && invoice.status !== "paid" && isOps && (
            <div className="border-t pt-4" style={{ borderColor: "var(--border-subtle)" }}>
              <p className="lbl mb-2">Record a payment</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block" htmlFor="pay-amount">
                  <span className="lbl">Amount (₹)</span>
                  <input
                    id="pay-amount"
                    type="number"
                    step="0.01"
                    className="field mt-1"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    disabled={pending}
                  />
                </label>
                <label className="block" htmlFor="pay-date">
                  <span className="lbl">Confirmed as of</span>
                  <input
                    id="pay-date"
                    type="date"
                    className="field mt-1"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    disabled={pending}
                  />
                </label>
                <label className="block" htmlFor="pay-ref">
                  <span className="lbl">Reference (optional)</span>
                  <input
                    id="pay-ref"
                    className="field mt-1"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    disabled={pending}
                  />
                </label>
              </div>
              <button type="button" className="btn-primary mt-3" disabled={pending} onClick={submitPayment}>
                {pending ? "Saving…" : "Record payment"}
              </button>
            </div>
          )}
        </>
      )}

      {voidedInvoices.length > 0 && (
        <details className="mt-4 border-t pt-3" style={{ borderColor: "var(--border-subtle)" }}>
          <summary className="cursor-pointer text-[12.5px] font-semibold" style={{ color: "var(--text-muted)" }}>
            {voidedInvoices.length} voided attach{voidedInvoices.length === 1 ? "" : "es"} — kept as history
          </summary>
          <ul className="mt-2 space-y-1.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            {voidedInvoices.map((v) => (
              <li key={v.id}>
                {v.number} · {rupees(v.amount)} — voided by {v.voidedBy} on {formatDate(v.voidedAt)}:{" "}
                {v.voidReason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
