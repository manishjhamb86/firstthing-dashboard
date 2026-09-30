"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardTitle, EmptyState, ErrorText, Field, StatusChip } from "@/components/ui";
import { Modal } from "@/components/modal";
import { formatDate, monthLabel } from "@/lib/format-date";
import { METHOD_LABEL, type PaymentMethod } from "@/lib/payment";
import { recordRetailPayment, voidRetailInvoice } from "../actions";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  period: string;
  invoiceDate: string | null;
  total: number;
  paid: boolean;
  paidOn: string | null;
  advanceAmount: number | null;
  advanceOn: string | null;
  s3Key: string | null;
  fileName: string | null;
  fileUrl: string | null;
  voidedAt: string | null;
  voidedByName: string | null;
  voidReason: string | null;
  payments: { id: string; amount: number; method: string; paidOn: string; reference: string | null }[];
  paidTotal: number;
  settled: boolean;
};

/** Every invoice this customer has on record — live ones with what to do
 *  next, voided ones kept as history rather than hidden. */
export function InvoicesList({ invoices }: { invoices: InvoiceRow[] }) {
  const live = invoices.filter((i) => !i.voidedAt);
  const voided = invoices.filter((i) => i.voidedAt);

  return (
    <Card className="overflow-hidden">
      <div className="p-5 pb-0">
        <CardTitle>Invoices</CardTitle>
      </div>
      {live.length === 0 ? (
        <div className="p-5">
          <EmptyState title="No invoices yet">Record a sale, or file one from invoice intake&apos;s own review.</EmptyState>
        </div>
      ) : (
        <div className="p-5 pt-3 space-y-3">
          {live.map((i) => (
            <InvoiceRowCard key={i.id} invoice={i} />
          ))}
        </div>
      )}
      {voided.length > 0 && (
        <details className="border-t p-5" style={{ borderColor: "var(--border-subtle)" }}>
          <summary className="cursor-pointer text-[12.5px] font-semibold" style={{ color: "var(--text-muted)" }}>
            {voided.length} voided invoice{voided.length === 1 ? "" : "s"} — kept as history
          </summary>
          <ul className="mt-2 space-y-1.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            {voided.map((i) => (
              <li key={i.id}>
                {i.invoiceNumber} · {rupees(i.total)} — voided by {i.voidedByName ?? "—"} on {formatDate(i.voidedAt!)}: {i.voidReason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function InvoiceRowCard({ invoice: i }: { invoice: InvoiceRow }) {
  const router = useRouter();
  const [showPay, setShowPay] = useState(false);
  const [showVoid, setShowVoid] = useState(false);
  const [pay, setPay] = useState({ amount: "", paidOn: new Date().toISOString().slice(0, 10), method: "bank_transfer" as PaymentMethod, reference: "" });
  const [voidReason, setVoidReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const outstanding = Math.max(0, Math.round((i.total - i.paidTotal) * 100) / 100);

  function openPay() {
    setPay({ amount: outstanding ? String(outstanding) : "", paidOn: new Date().toISOString().slice(0, 10), method: "bank_transfer", reference: "" });
    setError(null);
    setShowPay(true);
  }
  function savePayment() {
    setError(null);
    startTransition(async () => {
      const r = await recordRetailPayment(i.id, pay.method, pay.reference, { amount: pay.amount, paidOn: pay.paidOn });
      if ("error" in r) return setError(r.error);
      setShowPay(false);
      router.refresh();
    });
  }
  function saveVoid() {
    setError(null);
    startTransition(async () => {
      const r = await voidRetailInvoice(i.id, voidReason);
      if ("error" in r) return setError(r.error);
      setShowVoid(false);
      router.refresh();
    });
  }

  return (
    <div className="rounded-[var(--r-md)] border p-3.5" style={{ borderColor: "var(--border-subtle)" }}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-semibold">
            {i.invoiceNumber} <span className="text-[13px] font-normal text-[var(--text-subtle)]">· {monthLabel(i.period)}</span>
          </p>
          <p className="text-[12.5px] text-[var(--text-subtle)]">{i.invoiceDate ? formatDate(i.invoiceDate) : "No date recorded"}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="num font-semibold">{rupees(i.total)}</span>
          {i.settled ? (
            <StatusChip tone="ok">Settled</StatusChip>
          ) : i.paidTotal > 0 ? (
            <StatusChip tone="warn">{rupees(outstanding)} outstanding</StatusChip>
          ) : (
            <StatusChip tone="warn">Unpaid</StatusChip>
          )}
        </div>
      </div>

      {i.payments.length > 0 && (
        <ul className="mt-2 space-y-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          {i.payments.map((p) => (
            <li key={p.id}>
              <span className="num">{rupees(p.amount)}</span> — {METHOD_LABEL[p.method as PaymentMethod] ?? p.method} · {formatDate(p.paidOn)}
              {p.reference ? ` · ${p.reference}` : ""}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[12.5px]">
        {i.fileUrl && (
          <a href={i.fileUrl} target="_blank" rel="noreferrer" className="font-semibold underline">
            View the PDF
          </a>
        )}
        {!i.fileUrl && <span style={{ color: "var(--text-subtle)" }}>No file on record</span>}
        {!i.settled && (
          <button type="button" className="font-semibold underline" style={{ color: "var(--accent)" }} onClick={openPay}>
            Record payment
          </button>
        )}
        <button type="button" className="font-semibold underline" style={{ color: "var(--bad-fg)" }} onClick={() => { setVoidReason(""); setError(null); setShowVoid(true); }}>
          Void
        </button>
      </div>

      <Modal
        open={showPay}
        onClose={() => setShowPay(false)}
        title={`Record a payment · ${rupees(outstanding)} outstanding`}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setShowPay(false)}>Cancel</button>
            <button type="button" className="btn-primary" disabled={pending} onClick={savePayment}>{pending ? "Saving…" : "Record payment"}</button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount received (₹)" htmlFor="rp-amount">
              <input id="rp-amount" type="number" step="0.01" className="field" value={pay.amount} onChange={(e) => setPay((x) => ({ ...x, amount: e.target.value }))} />
            </Field>
            <Field label="Received on" htmlFor="rp-date">
              <input id="rp-date" type="date" className="field" value={pay.paidOn} onChange={(e) => setPay((x) => ({ ...x, paidOn: e.target.value }))} />
            </Field>
          </div>
          <Field label="Paid by" htmlFor="rp-method">
            <select id="rp-method" className="field" value={pay.method} onChange={(e) => setPay((x) => ({ ...x, method: e.target.value as PaymentMethod }))}>
              {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>{METHOD_LABEL[m]}</option>
              ))}
            </select>
          </Field>
          <Field label="Note (optional)" htmlFor="rp-ref">
            <input id="rp-ref" className="field" value={pay.reference} onChange={(e) => setPay((x) => ({ ...x, reference: e.target.value }))} placeholder="UTR, cheque number, or anything to remember it by" />
          </Field>
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      </Modal>

      <Modal
        open={showVoid}
        onClose={() => setShowVoid(false)}
        title="Void this invoice"
        description="It was filed in error — kept on record, struck through. Record the corrected one separately."
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setShowVoid(false)}>Cancel</button>
            <button type="button" className="btn-secondary" disabled={pending} onClick={saveVoid}>{pending ? "Voiding…" : "Confirm void"}</button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Why is this being voided" htmlFor="rv-reason">
            <input id="rv-reason" className="field" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Wrong customer, wrong amount, etc." />
          </Field>
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      </Modal>
    </div>
  );
}
