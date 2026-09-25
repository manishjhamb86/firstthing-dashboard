"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardTitle, ErrorText, StatusChip } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format-date";
import {
  acknowledgeMismatch,
  attachInvoice,
  confirmPaymentStatus,
  getInvoiceDownloadUrl,
  getInvoiceUploadUrl,
  getPaymentAttachmentUploadUrl,
  getPaymentAttachmentUrl,
  recordPayment,
  releaseCalculation,
  voidInvoiceAttachment,
} from "./invoice-actions";
import { METHOD_LABEL, tdsFromRate, type PaymentMethod } from "@/lib/payment";

export type InvoiceState = {
  id: string;
  number: string;
  issueDate: string;
  dueDate: string;
  amount: number;
  computedAmount: number;
  reconciliationStatus: "unchecked" | "matched" | "mismatched" | "acknowledged" | "not_applicable";
  status: "attached" | "released" | "overdue" | "warning" | "suspended" | "paid";
  fileName: string;
  /** Received + TDS: what the recorded payments settle. */
  paidTotal: number;
  /** The invoice's value before GST — the TDS base. */
  subtotal: number | null;
  payments: Array<{
    id: string;
    amount: number;
    tdsAmount: number;
    method: string;
    utrNumber: string | null;
    chequeNumber: string | null;
    chequeDate: string | null;
    chequeBank: string | null;
    confirmedAsOf: string;
    reference: string | null;
    attachments: { key: string; name: string; kind: string }[];
  }>;
  /** CON-13's safety rule: when ops last confirmed against Zoho that this is
   *  what the invoice's payment status genuinely is, right now. Stale data
   *  stops the arrears_sweep job's suspension clock rather than firing on it. */
  paymentStatusConfirmedAt: string | null;
} | null;

/** What the arrears_sweep job (scripts/job-worker.ts) already computed —
 *  this screen only ever displays CON-13's clock, never recomputes it with
 *  different logic. */
export type ArrearsView = {
  phase: "not_released" | "current" | "overdue" | "warning" | "suspended" | "paid";
  daysUntilSuspension: number | null;
  suspendDueAt: string | null;
} | null;

const rupees = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const RECON_META: Record<string, { label: string; tone: "ok" | "warn" | "bad" }> = {
  unchecked: { label: "Not yet checked", tone: "warn" },
  matched: { label: "Matches our figure", tone: "ok" },
  mismatched: { label: "Doesn't match — needs acknowledging", tone: "bad" },
  acknowledged: { label: "Mismatch acknowledged", tone: "warn" },
  // CON-47 — an invoice-first month has no computed total to compare against.
  not_applicable: { label: "From the invoice itself — no computed total to compare", tone: "ok" },
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
  calculationStatus,
  invoice,
  canRelease,
  releaseBlockedReason,
  isOps,
  voidedInvoices,
  arrears,
}: {
  calculationId: string;
  /** The MONTH's own status — release is offered while it is unreleased,
   *  whichever paid state the invoice is in (an invoice-first month paid at
   *  intake is `paid` from the start; CON-47). */
  calculationStatus: string;
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
  arrears: ArrearsView;
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
  const [payMethod, setPayMethod] = useState<PaymentMethod>("bank_transfer");
  const [payUtr, setPayUtr] = useState("");
  const [cheque, setCheque] = useState({ number: "", date: "", bank: "" });
  const [tdsOn, setTdsOn] = useState(false);
  const [tdsRate, setTdsRate] = useState("");
  const [tdsAmount, setTdsAmount] = useState("");
  const [files, setFiles] = useState<{ file: File; kind: "cheque" | "tds_certificate" | "other" }[]>([]);
  const outstanding = invoice ? Math.max(0, Math.round((invoice.amount - invoice.paidTotal) * 100) / 100) : 0;

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
    if (!payDate) return setError("Enter the date it was received.");
    startTransition(async () => {
      const attachments: { key: string; name: string; kind: "cheque" | "tds_certificate" | "other" }[] = [];
      for (const f of files) {
        const slot = await getPaymentAttachmentUploadUrl({ calculationId, fileName: f.file.name, contentType: f.file.type || "application/octet-stream" });
        if ("error" in slot) return setError(slot.error);
        const put = await fetch(slot.uploadUrl, { method: "PUT", body: f.file, headers: { "Content-Type": f.file.type } });
        if (!put.ok) return setError(`Could not upload ${f.file.name}. Try again.`);
        attachments.push({ key: slot.key, name: f.file.name, kind: f.kind });
      }
      const result = await recordPayment({
        calculationId,
        amount: Number(payAmount || 0),
        confirmedAsOf: payDate,
        reference: payRef,
        method: payMethod,
        utrNumber: payUtr,
        chequeNumber: cheque.number,
        chequeDate: cheque.date,
        chequeBank: cheque.bank,
        tdsAmount: tdsOn ? Number(tdsAmount || 0) : 0,
        tdsRatePct: tdsOn && tdsRate ? Number(tdsRate) : null,
        attachments,
      });
      if (result.error) return setError(result.error);
      setNotice("Payment recorded.");
      setPayRef("");
      setPayUtr("");
      setCheque({ number: "", date: "", bank: "" });
      setTdsOn(false);
      setTdsRate("");
      setTdsAmount("");
      setFiles([]);
      router.refresh();
    });
  }

  async function openAttachment(paymentId: string, key: string) {
    const r = await getPaymentAttachmentUrl(paymentId, key);
    if ("error" in r) return setError(r.error);
    window.open(r.url, "_blank", "noopener,noreferrer");
  }

  function submitConfirmStatus() {
    setError(null);
    startTransition(async () => {
      const result = await confirmPaymentStatus(calculationId);
      if (result.error) return setError(result.error);
      setNotice("Confirmed — still unpaid as of today.");
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

          {(invoice.status === "attached" || (calculationStatus !== "released" && calculationStatus !== "superseded")) && (
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
                  Releasing a month is the accountant&apos;s act — ops permissions do not confer it.
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

          {invoice.status !== "attached" && invoice.status !== "paid" && arrears && (
            <div className="border-t pt-4" style={{ borderColor: "var(--border-subtle)" }}>
              <p className="lbl mb-1">Following up</p>
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                {arrears.phase === "suspended"
                  ? "Suspended — field servicing is paused until this is paid."
                  : arrears.daysUntilSuspension !== null && arrears.daysUntilSuspension > 0
                    ? `${arrears.daysUntilSuspension} day${arrears.daysUntilSuspension === 1 ? "" : "s"} until suspension, if it stays unpaid.`
                    : "Suspension is due — the next automated pass decides it."}
              </p>
              <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
                {invoice.paymentStatusConfirmedAt
                  ? `Payment status last confirmed against Zoho ${formatDateTime(new Date(invoice.paymentStatusConfirmedAt))}.`
                  : "Payment status has never been confirmed against Zoho."}{" "}
                A suspension only ever fires against a same-day confirmation (the safety rule) —
                recording a payment confirms it too.
              </p>
              {isOps && (
                <button type="button" className="btn-outline mt-2" disabled={pending} onClick={submitConfirmStatus}>
                  {pending ? "Saving…" : "Confirm — still unpaid as of today"}
                </button>
              )}
            </div>
          )}

          {invoice.payments.length > 0 && (
            <div className="mb-4 border-t pt-4" style={{ borderColor: "var(--border-subtle)" }}>
              <p className="lbl mb-2">Payments recorded</p>
              <ul className="space-y-2 text-[13px]">
                {invoice.payments.map((p) => (
                  <li key={p.id} className="rounded-[var(--r-md)] border px-3 py-2" style={{ borderColor: "var(--border-subtle)" }}>
                    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="num font-semibold">{rupees(p.amount)}</span>
                      <span>{METHOD_LABEL[p.method as PaymentMethod] ?? p.method}</span>
                      {p.tdsAmount > 0 && <span>+ TDS {rupees(p.tdsAmount)}</span>}
                      <span style={{ color: "var(--text-subtle)" }}>received {formatDate(new Date(p.confirmedAsOf))}</span>
                    </p>
                    <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                      {[
                        p.utrNumber && `UTR ${p.utrNumber}`,
                        p.chequeNumber && `Cheque ${p.chequeNumber}${p.chequeDate ? ` dated ${formatDate(new Date(p.chequeDate))}` : ""}${p.chequeBank ? ` · ${p.chequeBank}` : ""}`,
                        p.reference,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {p.attachments.length > 0 && (
                      <p className="mt-1 flex flex-wrap gap-3 text-[12.5px]">
                        {p.attachments.map((a) => (
                          <button key={a.key} type="button" className="font-semibold" style={{ color: "var(--accent)" }} onClick={() => openAttachment(p.id, a.key)}>
                            {a.kind === "cheque" ? "Cheque copy" : a.kind === "tds_certificate" ? "TDS certificate" : "File"} — {a.name} ↗
                          </button>
                        ))}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {invoice.status !== "attached" && invoice.status !== "paid" && isOps && (
            <div className="border-t pt-4" style={{ borderColor: "var(--border-subtle)" }}>
              <p className="lbl mb-2">Record a payment · {rupees(outstanding)} outstanding</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block" htmlFor="pay-method">
                  <span className="lbl">Paid by</span>
                  <select id="pay-method" className="field mt-1" value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)} disabled={pending}>
                    {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => (
                      <option key={m} value={m}>
                        {METHOD_LABEL[m]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block" htmlFor="pay-amount">
                  <span className="lbl">Amount received (₹)</span>
                  <input id="pay-amount" type="number" step="0.01" className="field mt-1" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} disabled={pending} />
                </label>
                <label className="block" htmlFor="pay-date">
                  <span className="lbl">Received on</span>
                  <input id="pay-date" type="date" className="field mt-1" value={payDate} onChange={(e) => setPayDate(e.target.value)} disabled={pending} />
                </label>
                {(payMethod === "bank_transfer" || payMethod === "upi") && (
                  <label className="block sm:col-span-2" htmlFor="pay-utr">
                    <span className="lbl">UTR / transaction reference</span>
                    <input id="pay-utr" className="field mt-1 num" value={payUtr} onChange={(e) => setPayUtr(e.target.value)} disabled={pending} placeholder="As on the bank statement" />
                  </label>
                )}
                {payMethod === "cheque" && (
                  <>
                    <label className="block" htmlFor="pay-chq-no">
                      <span className="lbl">Cheque number</span>
                      <input id="pay-chq-no" inputMode="numeric" className="field mt-1 num" value={cheque.number} onChange={(e) => setCheque((c) => ({ ...c, number: e.target.value }))} disabled={pending} />
                    </label>
                    <label className="block" htmlFor="pay-chq-date">
                      <span className="lbl">Cheque date</span>
                      <input id="pay-chq-date" type="date" className="field mt-1" value={cheque.date} onChange={(e) => setCheque((c) => ({ ...c, date: e.target.value }))} disabled={pending} />
                    </label>
                    <label className="block" htmlFor="pay-chq-bank">
                      <span className="lbl">Drawn on (bank)</span>
                      <input id="pay-chq-bank" className="field mt-1" value={cheque.bank} onChange={(e) => setCheque((c) => ({ ...c, bank: e.target.value }))} disabled={pending} />
                    </label>
                  </>
                )}
                <label className="block sm:col-span-3" htmlFor="pay-ref">
                  <span className="lbl">Note (optional)</span>
                  <input id="pay-ref" className="field mt-1" value={payRef} onChange={(e) => setPayRef(e.target.value)} disabled={pending} />
                </label>
              </div>

              <label className="mt-3 flex items-center gap-2 text-[13.5px]">
                <input
                  type="checkbox"
                  checked={tdsOn}
                  onChange={(e) => {
                    setTdsOn(e.target.checked);
                    if (e.target.checked && !tdsRate && !tdsAmount) {
                      setTdsRate("2");
                      if (invoice.subtotal) setTdsAmount(String(tdsFromRate(invoice.subtotal, 2)));
                    }
                  }}
                  disabled={pending}
                />
                The society deducted TDS
              </label>
              {tdsOn && (
                <div className="mt-2 grid gap-3 sm:grid-cols-3">
                  <label className="block" htmlFor="pay-tds-rate">
                    <span className="lbl">TDS rate (%)</span>
                    <input
                      id="pay-tds-rate"
                      type="number"
                      step="0.01"
                      className="field mt-1"
                      value={tdsRate}
                      onChange={(e) => {
                        setTdsRate(e.target.value);
                        if (invoice.subtotal && e.target.value) setTdsAmount(String(tdsFromRate(invoice.subtotal, Number(e.target.value))));
                      }}
                      disabled={pending}
                    />
                  </label>
                  <label className="block" htmlFor="pay-tds">
                    <span className="lbl">TDS deducted (₹)</span>
                    <input id="pay-tds" type="number" step="1" className="field mt-1" value={tdsAmount} onChange={(e) => setTdsAmount(e.target.value)} disabled={pending} />
                  </label>
                  <p className="self-end text-[12px]" style={{ color: "var(--text-subtle)" }}>
                    {invoice.subtotal ? `On ${rupees(invoice.subtotal)} before GST. ` : ""}TDS counts towards settling the invoice.
                  </p>
                </div>
              )}

              <div className="mt-3">
                <span className="lbl">Cheque copy or TDS certificate (optional)</span>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    aria-label="Attach files"
                    onChange={(e) => {
                      const picked = Array.from(e.target.files ?? []);
                      setFiles((f) => [...f, ...picked.map((file) => ({ file, kind: payMethod === "cheque" ? ("cheque" as const) : tdsOn ? ("tds_certificate" as const) : ("other" as const) }))]);
                      e.target.value = "";
                    }}
                    disabled={pending}
                  />
                </div>
                {files.length > 0 && (
                  <ul className="mt-2 space-y-1 text-[12.5px]">
                    {files.map((f, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <select
                          aria-label={`What ${f.file.name} is`}
                          className="field field-auto py-0 text-[12px]"
                          value={f.kind}
                          onChange={(e) => setFiles((x) => x.map((y, j) => (j === i ? { ...y, kind: e.target.value as typeof y.kind } : y)))}
                        >
                          <option value="cheque">Cheque copy</option>
                          <option value="tds_certificate">TDS certificate</option>
                          <option value="other">Other</option>
                        </select>
                        <span>{f.file.name}</span>
                        <button type="button" style={{ color: "var(--text-subtle)" }} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}>
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
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
