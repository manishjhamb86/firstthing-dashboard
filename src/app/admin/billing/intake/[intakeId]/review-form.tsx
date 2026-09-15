"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, ErrorText, Field, StatusChip } from "@/components/ui";
import { SearchSelect } from "@/components/search-select";
import { Modal } from "@/components/modal";
import { formatDate, monthLabel } from "@/lib/format-date";
import type { ExtractedInvoice } from "@/lib/invoice-extract";
import type { Review, ReviewLine } from "@/lib/invoice-intake";
import { discardIntake, previewIntake, saveIntakeReview, submitIntake, type IntakePreview } from "../actions";

/**
 * SCR-094's form. Five cards in the order a person checks an invoice, each
 * with its own ✓ / ⚠ state; the submit bar lists what is still open. The AI's
 * proposal is shown BESIDE each control, never pre-committed into it, so a
 * reader can tell what was read from what was typed (INV-04 for the month,
 * and the same rule for the rest). Card 5 is the society-facing consequence,
 * recomputed by the server from the confirmed lines and never editable.
 */

type Preview = Exclude<IntakePreview, { error: string }>;

function inr(n: number | null | undefined, dp = 2): string {
  if (n === null || n === undefined) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}
function num(n: number | null | undefined, dp = 0): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function Verbatim({ children }: { children: string | undefined }) {
  if (!children) return null;
  return (
    <p className="mt-1 text-[12px]" style={{ color: "var(--text-subtle)" }}>
      Invoice says: “{children}”
    </p>
  );
}

function CardHead({ step, title, chip }: { step: number; title: string; chip: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2.5">
        <span
          className="num inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold"
          style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
        >
          {step}
        </span>
        <p className="text-[15px] font-semibold">{title}</p>
      </div>
      {chip}
    </div>
  );
}

export function ReviewForm({
  intakeId,
  fileName,
  documentUrl,
  status,
  extraction,
  initialReview,
  initialPreview,
  societies,
}: {
  intakeId: string;
  fileName: string;
  documentUrl: string | null;
  status: string;
  extraction: ExtractedInvoice | null;
  initialReview: Review;
  initialPreview: Preview | null;
  societies: { id: string; name: string; location: string }[];
}) {
  const router = useRouter();
  const [review, setReview] = useState<Review>(initialReview);
  const [preview, setPreview] = useState<Preview | null>(initialPreview);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showDoc, setShowDoc] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [discardReason, setDiscardReason] = useState("");
  const [pending, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);

  // Card 5 recomputes on every change (debounced) — the same pure function
  // the submit runs, so preview and record cannot disagree.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      void previewIntake(intakeId, review).then((p) => {
        if (!("error" in p && p.error)) setPreview(p as Preview);
      });
    }, 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [review, intakeId]);

  const set = <K extends keyof Review>(key: K, value: Review[K]) => setReview((r) => ({ ...r, [key]: value }));
  const setLine = (lineNo: number, patch: Partial<ReviewLine>) =>
    setReview((r) => ({ ...r, lines: r.lines.map((l) => (l.lineNo === lineNo ? { ...l, ...patch } : l)) }));
  const addLine = () =>
    setReview((r) => ({
      ...r,
      lines: [
        ...r.lines,
        { lineNo: (r.lines.at(-1)?.lineNo ?? 0) + 1, description: "", hsn: "", qty: null, rate: null, discount: 0, taxPct: null, taxAmount: null, amount: null, kind: "service", circuitId: null, applyCountForward: false },
      ],
    }));
  const removeLine = (lineNo: number) => setReview((r) => ({ ...r, lines: r.lines.filter((l) => l.lineNo !== lineNo) }));

  const numInput = (v: number | null) => (v === null ? "" : String(v));
  const parseNum = (s: string): number | null => (s.trim() === "" ? null : Number.isFinite(Number(s)) ? Number(s) : null);

  const open = preview?.openItems ?? [];
  const circuitOptions = preview?.circuitOptions ?? [];
  const arithmetic = preview?.arithmetic ?? null;
  const derived = preview?.derived ?? null;
  const duplicate = preview?.duplicateOf ?? null;

  const step1Ok = review.societyId && /^\d{4}-\d{2}$/.test(review.period) && review.invoiceNumber && review.invoiceDate && review.dueDate && !duplicate;
  const step2Open = open.filter((o) => o.includes("(step 2)")).length;
  const step4Ok = review.paid === "unpaid" || (review.paid === "paid" && review.paidOn);

  const proposedSociety = extraction?.billToName.value ?? "";
  const proposedMonth = extraction?.invoiceForMonth.value ?? "";

  function save() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const r = await saveIntakeReview(intakeId, review);
        if (r.error) setError(r.error);
        else {
          setNotice("Saved — this row stays on the intake list until you submit it.");
          router.refresh();
        }
      } catch {
        setError("Could not save — the page may be out of date. Reload and try again.");
      }
    });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await submitIntake(intakeId, review);
        if (r.error) setError(r.error);
        else router.push("/admin/billing/intake");
      } catch {
        setError("Could not submit — the page may be out of date. Reload and try again.");
      }
    });
  }

  function discard() {
    setError(null);
    startTransition(async () => {
      const r = await discardIntake(intakeId, discardReason);
      if (r.error) setError(r.error);
      else router.push("/admin/billing/intake");
    });
  }

  const lineCheck = (lineNo: number) => arithmetic?.lines.find((l) => l.lineNo === lineNo)?.check ?? null;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-12">
      {/* Document — sticky beside the review on a wide screen; a toggle above it on a phone. */}
      <div className="lg:col-span-5 lg:sticky lg:top-24">
        <button type="button" className="btn-ghost btn-sm mb-2 lg:hidden" onClick={() => setShowDoc((v) => !v)}>
          {showDoc ? "Hide invoice" : "Show invoice"}
        </button>
        <Card className={`p-3 ${showDoc ? "" : "hidden lg:block"}`}>
          <div className="mb-2 flex items-center justify-between">
            <span className="lbl">Invoice as filed</span>
            <span className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
              {fileName}
            </span>
          </div>
          {documentUrl ? (
            <iframe title="Invoice PDF" src={documentUrl} className="h-[70vh] w-full rounded-[var(--r-sm)] border" style={{ borderColor: "var(--border)" }} />
          ) : (
            <p className="p-4 text-sm" style={{ color: "var(--text-muted)" }}>
              The document could not be loaded from storage.
            </p>
          )}
          {extraction && extraction.clarifications.length > 0 && (
            <div className="mt-3 space-y-2">
              <span className="lbl">The reader asked</span>
              {extraction.clarifications.map((c) => (
                <div key={c.id} className="rounded-[var(--r-sm)] border px-3 py-2 text-[12.5px]" style={{ background: "var(--warn-bg)", borderColor: "var(--warn-line)", color: "var(--warn-fg)" }}>
                  <p className="font-semibold">{c.question}</p>
                  <p>{c.because}</p>
                  {c.options.length > 0 && <p className="mt-1">Seen: {c.options.join(" · ")}</p>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-4 lg:col-span-7">
        {status === "could_not_read" && (
          <div className="rounded-[var(--r-sm)] border px-3.5 py-2.5 text-[13px]" style={{ background: "var(--bad-bg)", borderColor: "var(--bad-line)", color: "var(--bad-fg)" }}>
            The invoice could not be read automatically — enter what it says by hand, reading from the PDF.
          </div>
        )}

        {/* Card 1 — who and when */}
        <Card className="p-5">
          <CardHead step={1} title="Who and when" chip={duplicate ? <StatusChip tone="bad">Duplicate</StatusChip> : step1Ok ? <StatusChip tone="ok">Confirmed</StatusChip> : <StatusChip tone="warn">To confirm</StatusChip>} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Field label="Society" htmlFor="rv-society">
                <SearchSelect
                  id="rv-society"
                  options={societies.map((s) => ({ id: s.id, label: s.name, sublabel: s.location }))}
                  value={review.societyId}
                  onCommit={(id) => setReview((r) => ({ ...r, societyId: id, lines: r.lines.map((l) => ({ ...l, circuitId: null })) }))}
                  placeholder="Search societies…"
                />
              </Field>
              <Verbatim>{proposedSociety}</Verbatim>
              {proposedSociety && review.societyId && !societies.find((s) => s.id === review.societyId)?.name.toLowerCase().includes(proposedSociety.toLowerCase().split(" ")[0]) && (
                <p className="mt-1 text-[12px]" style={{ color: "var(--warn-fg)" }}>
                  Your selection differs from the name on the invoice — stated here, not blocked.
                </p>
              )}
            </div>
            <div>
              <Field label="Month" htmlFor="rv-period" hint="The month this invoice is FOR — your selection, whatever the paper says.">
                <input id="rv-period" type="month" className="field" value={review.period} onChange={(e) => set("period", e.target.value)} />
              </Field>
              <Verbatim>{proposedMonth ? `${proposedMonth}${extraction?.invoiceForMonth.sourceText ? ` (“${extraction.invoiceForMonth.sourceText}”)` : ""}` : undefined}</Verbatim>
              {proposedMonth && review.period && proposedMonth !== review.period && (
                <p className="mt-1 text-[12px]" style={{ color: "var(--warn-fg)" }}>
                  The invoice names {monthLabel(proposedMonth)}; you have chosen {monthLabel(review.period)}.
                </p>
              )}
            </div>
            <div>
              <Field label="Invoice number" htmlFor="rv-number">
                <input id="rv-number" type="text" className="field" value={review.invoiceNumber} onChange={(e) => set("invoiceNumber", e.target.value)} />
              </Field>
              <Verbatim>{extraction?.invoiceNumber.sourceText}</Verbatim>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Field label="Invoice date" htmlFor="rv-date">
                  <input id="rv-date" type="date" className="field" value={review.invoiceDate} onChange={(e) => set("invoiceDate", e.target.value)} />
                </Field>
                <Verbatim>{extraction?.invoiceDate.sourceText}</Verbatim>
              </div>
              <div>
                <Field label="Due date" htmlFor="rv-due">
                  <input id="rv-due" type="date" className="field" value={review.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
                </Field>
                <Verbatim>{extraction?.dueDate.sourceText}</Verbatim>
              </div>
            </div>
          </div>
          {duplicate && (
            <div className="mt-3 rounded-[var(--r-sm)] border px-3.5 py-2.5 text-[13px]" style={{ background: "var(--bad-bg)", borderColor: "var(--bad-line)", color: "var(--bad-fg)" }}>
              A live invoice already exists for this society-month ({duplicate.number}
              {duplicate.released ? ", released" : ""}). Void it from the month first if it was filed in error — this one cannot be submitted over it.
            </div>
          )}
        </Card>

        {/* Card 2 — lines */}
        <Card className="p-5">
          <CardHead step={2} title="Lines — what each one is, and which circuit it bills" chip={review.lines.length === 0 ? <StatusChip tone="bad">No lines</StatusChip> : step2Open > 0 ? <StatusChip tone="warn">{step2Open} to check</StatusChip> : <StatusChip tone="ok">Mapped</StatusChip>} />
          {!review.societyId && <p className="mb-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>Confirm the society first — the circuits to map to come from it.</p>}
          <div className="space-y-3">
            {review.lines.map((l) => {
              const check = lineCheck(l.lineNo);
              const dline = derived?.lines.find((d) => d.lineNo === l.lineNo);
              const nd = derived?.notDerivable.find((d) => d.lineNo === l.lineNo);
              return (
                <div key={l.lineNo} className="rounded-[var(--r-sm)] border p-3" style={{ borderColor: l.kind === "other" ? "var(--border-subtle)" : check && !check.ok ? "var(--warn-line)" : "var(--border)", opacity: l.kind === "other" ? 0.8 : 1 }}>
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold" style={{ color: "var(--text-subtle)" }}>Line {l.lineNo}{l.hsn ? ` · HSN ${l.hsn}` : ""}</p>
                      {status === "could_not_read" || !extraction ? (
                        <input type="text" className="field mt-1" placeholder="Description as printed" value={l.description} onChange={(e) => setLine(l.lineNo, { description: e.target.value })} />
                      ) : (
                        <p className="whitespace-pre-line text-[13px]">{l.description}</p>
                      )}
                    </div>
                    <div className="inline-flex rounded-[10px] p-0.5" style={{ background: "var(--neu-bg)" }}>
                      {(["service", "other"] as const).map((k) => (
                        <button key={k} type="button" onClick={() => setLine(l.lineNo, { kind: k, circuitId: k === "other" ? null : l.circuitId })} className="rounded-[8px] px-2.5 py-1 text-[12px] font-semibold" style={l.kind === k ? { background: "var(--surface)", color: "var(--text)", boxShadow: "0 1px 2px rgba(20,30,70,0.08)" } : { color: "var(--text-subtle)" }}>
                          {k === "service" ? "Service" : "Other"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {([["qty", "Qty (lights)"], ["rate", "Rate"], ["discount", "Discount"], ["amount", "Amount"]] as const).map(([k, label]) => (
                      <label key={k} className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-muted)" }}>
                        {label}
                        <input type="number" step="any" inputMode="decimal" className="field num mt-1" value={k === "discount" ? String(l.discount) : numInput(l[k])} onChange={(e) => setLine(l.lineNo, k === "discount" ? { discount: parseNum(e.target.value) ?? 0 } : ({ [k]: parseNum(e.target.value) } as Partial<ReviewLine>))} />
                      </label>
                    ))}
                  </div>
                  {check && !check.ok && <p className="mt-2 text-[12.5px]" style={{ color: "var(--warn-fg)" }}>{check.note}</p>}
                  {l.kind === "service" ? (
                    <div className="mt-2">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-muted)" }}>
                        Circuit
                        <select className="field mt-1" value={l.circuitId ?? ""} onChange={(e) => setLine(l.lineNo, { circuitId: e.target.value || null, applyCountForward: false })} disabled={!review.societyId}>
                          <option value="">{review.societyId ? (circuitOptions.length ? "Choose the circuit this line bills…" : "This society has no circuits yet") : "Confirm the society first"}</option>
                          {circuitOptions.map((c) => (
                            <option key={c.circuitId} value={c.circuitId}>
                              {c.label} · {num(c.representedLightCount)} lights
                            </option>
                          ))}
                        </select>
                      </label>
                      {!l.circuitId && review.societyId && circuitOptions.length === 0 && (
                        <p className="mt-1 text-[12.5px]" style={{ color: "var(--warn-fg)" }}>
                          No circuit on record for this society — create it from its deal&apos;s survey (or the document backfill) first.
                        </p>
                      )}
                      {dline && dline.countDisagreement !== null && (
                        <div className="mt-2 rounded-[var(--r-sm)] border px-3 py-2 text-[12.5px]" style={{ background: "var(--warn-bg)", borderColor: "var(--warn-line)", color: "var(--warn-fg)" }}>
                          <p>
                            <b>Invoice bills {num(dline.lightsBilled)} lights; the circuit records {num(dline.countDisagreement)}.</b> This month&apos;s stats use {num(dline.lightsBilled)}. The bill itself is not affected.
                          </p>
                          <label className="mt-1.5 flex items-start gap-2" style={{ color: "var(--text)" }}>
                            <input type="checkbox" className="mt-0.5" checked={l.applyCountForward} onChange={(e) => setLine(l.lineNo, { applyCountForward: e.target.checked })} />
                            <span>
                              Also apply {num(dline.lightsBilled)} to this circuit from {monthLabel(review.period)} onward
                              <span className="block text-[11.5px]" style={{ color: "var(--text-subtle)" }}>recorded with this invoice as the reason; earlier months are never restated</span>
                            </span>
                          </label>
                        </div>
                      )}
                      {nd && <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-subtle)" }}>{nd.reason}</p>}
                    </div>
                  ) : (
                    <p className="mt-2 text-[12px]" style={{ color: "var(--text-subtle)" }}>Counts toward the total, not toward savings.</p>
                  )}
                  {(status === "could_not_read" || !extraction) && (
                    <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => removeLine(l.lineNo)}>Remove line</button>
                  )}
                </div>
              );
            })}
          </div>
          {(status === "could_not_read" || !extraction || review.lines.length === 0) && (
            <button type="button" className="btn-ghost btn-sm mt-3" onClick={addLine}>+ Add a line</button>
          )}
        </Card>

        {/* Card 3 — totals */}
        <Card className="p-5">
          <CardHead step={3} title="Totals" chip={arithmetic ? arithmetic.ok ? <StatusChip tone="ok">Reconciles</StatusChip> : review.arithmeticAcknowledgement.trim() ? <StatusChip tone="info">Acknowledged</StatusChip> : <StatusChip tone="warn">Does not reconcile</StatusChip> : <StatusChip tone="neu">—</StatusChip>} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([["subtotal", "Sub total"], ["taxPct", "Tax %"], ["taxAmount", "Tax amount"], ["total", "Total"]] as const).map(([k, label]) => (
              <label key={k} className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-muted)" }}>
                {label}
                <input type="number" step="any" inputMode="decimal" className="field num mt-1" value={numInput(review[k])} onChange={(e) => set(k, parseNum(e.target.value))} />
              </label>
            ))}
          </div>
          {arithmetic?.totals && (
            <div className="mt-2 space-y-1 text-[12.5px]">
              {[arithmetic.totals.subtotal, arithmetic.totals.tax, arithmetic.totals.total].map((c, i) =>
                c.ok ? null : (
                  <p key={i} style={{ color: "var(--warn-fg)" }}>{c.note}</p>
                ),
              )}
            </div>
          )}
          {arithmetic && !arithmetic.ok && (
            <Field label="Why the figures are still right" htmlFor="rv-ack" hint="Required when the arithmetic does not reconcile — a manual credit, a rounding Zoho applied, a known correction.">
              <input id="rv-ack" type="text" className="field" value={review.arithmeticAcknowledgement} onChange={(e) => set("arithmeticAcknowledgement", e.target.value)} />
            </Field>
          )}
        </Card>

        {/* Card 4 — payment */}
        <Card className="p-5">
          <CardHead step={4} title="Payment" chip={step4Ok ? <StatusChip tone="ok">{review.paid === "paid" ? "Paid" : "Unpaid"}</StatusChip> : <StatusChip tone="warn">Not chosen</StatusChip>} />
          <div className="grid gap-3 sm:grid-cols-2">
            {(["paid", "unpaid"] as const).map((v) => (
              <label key={v} className="flex cursor-pointer items-start gap-3 rounded-[var(--r-sm)] border p-3" style={{ borderColor: review.paid === v ? "var(--accent-line)" : "var(--border)", background: review.paid === v ? "var(--accent-subtle)" : "transparent" }}>
                <input type="radio" name="rv-paid" className="mt-1" checked={review.paid === v} onChange={() => set("paid", v)} />
                <span className="text-[13.5px]">
                  <b>{v === "paid" ? "Paid" : "Unpaid"}</b>
                  <span className="block text-[12px]" style={{ color: "var(--text-subtle)" }}>
                    {v === "paid" ? "You will be asked the date it was paid." : `The overdue clock starts from ${review.dueDate ? formatDate(review.dueDate) : "the due date"} the moment the accountant publishes.`}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {review.paid === "paid" && (
            <div className="mt-3 max-w-xs">
              <Field label="Paid on" htmlFor="rv-paid-on">
                <input id="rv-paid-on" type="date" className="field" value={review.paidOn} onChange={(e) => set("paidOn", e.target.value)} />
              </Field>
            </div>
          )}
        </Card>

        {/* Card 5 — what the society will see */}
        <Card className="p-5">
          <CardHead step={5} title="What the society will see" chip={<span className="text-[12px]" style={{ color: "var(--text-subtle)" }}>Recomputed from the lines above · not editable</span>} />
          {!derived || (derived.lines.length === 0 && derived.notDerivable.length === 0) ? (
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Confirm the society, the month and at least one mapped service line to see the month&apos;s figures.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl tbl-compact">
                <thead>
                  <tr>
                    <th>Circuit</th>
                    <th className="text-right">Lights billed</th>
                    <th className="text-right">Saved kWh</th>
                    <th className="text-right">Saved ₹</th>
                    <th className="text-right">Savings %</th>
                    <th>Basis</th>
                  </tr>
                </thead>
                <tbody>
                  {derived.lines.map((d) => (
                    <tr key={d.lineNo}>
                      <td>
                        {circuitOptions.find((c) => c.circuitId === d.circuitId)?.label ?? d.lightType}
                        <span className="block text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
                          {d.basis === "agreed" ? `agreed ${num(d.benchmarkSavingsPct, 2)}%` : `measured from ${d.coverageDays} of ${d.daysInMonth} days`} · baseline {num(d.baselineKwhPerDay, 2)} kWh/day · {d.billedDays} days
                        </span>
                      </td>
                      <td className="num text-right">{num(d.lightsBilled)}</td>
                      <td className="num text-right">{num(d.savedKwh, 1)}</td>
                      <td className="num text-right">{inr(d.savedValue, 0)}</td>
                      <td className="num text-right">{num(d.savingsPct, 2)}</td>
                      <td>
                        <StatusChip tone={d.basis === "measured" ? "ok" : "info"}>{d.basis === "measured" ? "Measured" : "Agreed"}</StatusChip>
                        {d.belowBand && <span className="block text-[11.5px]" style={{ color: "var(--warn-fg)" }}>below the band — stats only, no billing consequence</span>}
                      </td>
                    </tr>
                  ))}
                  {derived.notDerivable.map((n) => (
                    <tr key={`nd-${n.lineNo}`}>
                      <td colSpan={6} className="text-[12.5px]" style={{ color: "var(--text-subtle)" }}>Line {n.lineNo}: {n.reason}</td>
                    </tr>
                  ))}
                  <tr style={{ background: "var(--surface-sunken)" }}>
                    <td className="font-semibold">Society total</td>
                    <td />
                    <td className="num text-right font-semibold">{num(derived.totals.savedKwh, 1)}</td>
                    <td className="num text-right font-semibold">{inr(derived.totals.savedValue, 0)}</td>
                    <td />
                    <td className="text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
                      {derived.lines.every((d) => d.basis === "agreed") ? "No readings this month — figures at the agreed benchmark. They re-derive from readings automatically once uploaded." : "Fee = the invoice's own lines, never recomputed."}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {preview?.contextNotes && preview.contextNotes.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[12px]" style={{ color: "var(--text-subtle)" }}>
              {preview.contextNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </Card>

        {/* Submit bar */}
        <Card className="p-4" >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" style={open.length === 0 ? undefined : undefined}>
            <div className="min-w-0">
              {open.length === 0 ? (
                <p className="font-semibold" style={{ color: "var(--ok-fg)" }}>Ready to submit for release.</p>
              ) : (
                <>
                  <p className="font-semibold">{open.length} thing{open.length === 1 ? "" : "s"} to resolve before submit</p>
                  <ul className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                    {open.map((o) => (
                      <li key={o}>· {o}</li>
                    ))}
                  </ul>
                </>
              )}
              {error && <div className="mt-2"><ErrorText>{error}</ErrorText></div>}
              {notice && <p className="mt-2 text-[12.5px]" style={{ color: "var(--ok-fg)" }}>{notice}</p>}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
              <button type="button" className="btn-ghost" disabled={pending} onClick={() => setDiscarding(true)}>Discard</button>
              <button type="button" className="btn-ghost" disabled={pending} onClick={save}>Save &amp; come back later</button>
              <button type="button" className="btn-primary" disabled={pending || open.length > 0} onClick={submit}>
                {pending ? "Working…" : "Submit for release"}
              </button>
            </div>
          </div>
        </Card>
      </div>

      <Modal open={discarding} onClose={() => setDiscarding(false)} title="Discard this upload" description={fileName}>
        <Field label="Why" htmlFor="rv-discard">
          <input id="rv-discard" type="text" className="field" value={discardReason} onChange={(e) => setDiscardReason(e.target.value)} placeholder="Wrong file, duplicate, not an invoice…" />
        </Field>
        <p className="mt-2 text-[12px]" style={{ color: "var(--text-subtle)" }}>The row leaves the intake list; the PDF stays in storage.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => setDiscarding(false)}>Keep it</button>
          <button type="button" className="btn-danger" disabled={pending || !discardReason.trim()} onClick={discard}>Discard</button>
        </div>
      </Modal>
    </div>
  );
}
