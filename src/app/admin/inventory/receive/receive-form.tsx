"use client";

import { FileDrop } from "@/components/file-drop";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardTitle, ErrorText, Field, StatusChip } from "@/components/ui";
import { SerialScanButton } from "@/components/serial-scan";
import { formatInstant } from "@/lib/format-date";
import { beginSupplierInvoiceUpload, extractSupplierInvoiceForm, receiveDelivery } from "../actions";

type PendingUpload = {
  id: string;
  fileName: string;
  status: "uploaded" | "read" | "could_not_read" | "processed";
  uploadedAt: string;
  errorMessage: string | null;
};

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Item = { id: string; name: string; tracking: "serial" | "length" | "quantity"; unit: string; defaultWarrantyMonths: number | null };
type Line = {
  itemTypeId: string;
  quantity: string;
  unitCost: string;
  supplierLot: string;
  manufacturedOn: string;
  warrantyMonths: string;
  warrantyBasis: "purchase" | "install";
  serials: string;
  /** The invoice's own wording for this line, when nothing matched an item automatically. */
  rawDescription: string;
};

const blankLine = (): Line => ({
  itemTypeId: "",
  quantity: "",
  unitCost: "",
  supplierLot: "",
  manufacturedOn: "",
  warrantyMonths: "",
  warrantyBasis: "purchase",
  serials: "",
  rawDescription: "",
});

const STATUS_LABEL: Record<PendingUpload["status"], string> = {
  uploaded: "Uploaded — not yet read",
  read: "Read — ready to process",
  could_not_read: "Could not be read",
  processed: "Received",
};
const STATUS_TONE: Record<PendingUpload["status"], "neu" | "ok" | "warn"> = {
  uploaded: "neu",
  read: "ok",
  could_not_read: "warn",
  processed: "ok",
};

export function ReceiveForm({
  suppliers,
  offices,
  items,
  today,
  pendingUploads,
  resumeUploadId,
}: {
  suppliers: { id: string; name: string }[];
  offices: { id: string; name: string }[];
  items: Item[];
  today: string;
  pendingUploads: PendingUpload[];
  resumeUploadId: string | null;
}) {
  const router = useRouter();
  const [head, setHead] = useState({ supplierId: "", invoiceNumber: "", invoiceDate: today, total: "", officeId: offices[0]?.id ?? "", receivedOn: today, notes: "" });
  const [file, setFile] = useState<File | null>(null);
  // The upload this form is tied to, once one exists — submit() marks THIS
  // row processed (2026-10-16), and it's what a re-read button re-reads.
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractNote, setExtractNote] = useState<string | null>(null);
  // Set when the chosen file's content hash matches an upload already on
  // record — a duplicate is never re-uploaded or re-read, only pointed at.
  const [duplicate, setDuplicate] = useState<{ id: string; fileName: string; status: PendingUpload["status"]; uploadedAt: string; firstBatchId: string | null } | null>(null);
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const setLine = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));

  function applyProposal(p: Awaited<ReturnType<typeof extractSupplierInvoiceForm>>["proposal"]) {
    if (!p) return;
    setHead((h) => ({
      ...h,
      supplierId: p.supplierId ?? h.supplierId,
      invoiceNumber: p.invoiceNumber || h.invoiceNumber,
      invoiceDate: p.invoiceDate || h.invoiceDate,
      total: p.total !== null ? String(p.total) : h.total,
    }));
    if (p.lines.length > 0) {
      setLines(
        p.lines.map((l) => ({
          ...blankLine(),
          itemTypeId: l.itemTypeId ?? "",
          quantity: l.quantity !== null ? String(l.quantity) : "",
          unitCost: l.unitCost !== null ? String(l.unitCost) : "",
          supplierLot: l.supplierLot,
          rawDescription: l.itemTypeId ? "" : l.description,
        })),
      );
    }
    const unmatched = p.lines.filter((l) => !l.itemTypeId).length;
    setExtractNote(
      unmatched === 0
        ? `Read ${p.lines.length} line${p.lines.length === 1 ? "" : "s"} from the invoice — check them before receiving.`
        : `Read ${p.lines.length} line${p.lines.length === 1 ? "" : "s"} — ${unmatched} need an item chosen by hand (shown below each).`,
    );
  }

  // Resume into a specific upload — from the pending-uploads list, from the
  // duplicate banner's "process it" link, or from ?upload= on arrival.
  async function resumeUpload(id: string, force = false) {
    setError(null);
    setDuplicate(null);
    setExtracting(true);
    setUploadId(id);
    try {
      const r = await extractSupplierInvoiceForm(id, force);
      setUploadFileName(r.fileName ?? null);
      if (r.error !== undefined || !r.proposal) {
        setExtractNote(r.error ?? "Could not read the invoice.");
        return;
      }
      applyProposal(r.proposal);
    } finally {
      setExtracting(false);
    }
  }

  // Resuming straight off the URL (?upload=, on a fresh page load). Deferred
  // to a microtask so resumeUpload's own setState calls land after this
  // effect has committed, not synchronously inside it.
  useEffect(() => {
    if (!resumeUploadId) return;
    queueMicrotask(() => {
      void resumeUpload(resumeUploadId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeUploadId]);

  // Upload is its own step, recorded before anything reads it (2026-10-16,
  // user-asked). The same bytes chosen again — this session or any other —
  // are refused as a duplicate rather than uploaded or read a second time.
  async function onChooseFile(f: File | null) {
    setFile(f);
    setUploadId(null);
    setUploadFileName(null);
    setExtractNote(null);
    setDuplicate(null);
    if (!f) return;
    setExtracting(true);
    try {
      const hash = await sha256Hex(f);
      const begin = await beginSupplierInvoiceUpload({ fileName: f.name, byteSize: f.size, fileHash: hash });
      if (begin.error !== undefined) {
        setExtractNote(begin.error);
        return;
      }
      if (begin.existing) {
        setDuplicate({
          id: begin.existing.id,
          fileName: begin.existing.fileName,
          status: begin.existing.status,
          uploadedAt: begin.existing.uploadedAt,
          firstBatchId: begin.existing.firstBatchId,
        });
        return;
      }
      const put = await fetch(begin.uploadUrl, { method: "PUT", body: f, headers: { "Content-Type": "application/pdf" } });
      if (!put.ok) {
        setExtractNote(`The invoice PDF did not upload (${put.status}) — try again.`);
        return;
      }
      setUploadId(begin.uploadId);
      setUploadFileName(f.name);
      const r = await extractSupplierInvoiceForm(begin.uploadId);
      if (r.error !== undefined || !r.proposal) {
        setExtractNote(r.error ?? "Could not read the invoice.");
        return;
      }
      applyProposal(r.proposal);
    } catch {
      setExtractNote("Could not read the invoice automatically — fill in the fields by hand.");
    } finally {
      setExtracting(false);
    }
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await receiveDelivery({
          supplierId: head.supplierId,
          invoiceNumber: head.invoiceNumber,
          invoiceDate: head.invoiceDate,
          total: head.total ? Number(head.total) : null,
          uploadId,
          receivedAtLocationId: head.officeId,
          receivedOn: head.receivedOn,
          notes: head.notes,
          lines: lines.map((l) => ({
            itemTypeId: l.itemTypeId,
            quantity: Number(l.quantity),
            unitCost: l.unitCost ? Number(l.unitCost) : null,
            supplierLot: l.supplierLot,
            manufacturedOn: l.manufacturedOn,
            warrantyMonths: l.warrantyMonths ? Number(l.warrantyMonths) : null,
            warrantyBasis: l.warrantyBasis,
            serialNumbers: l.serials.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
          })),
        });
        if (r.error !== undefined) return setError(r.error);
        const ids = r.batchIds ?? [];
        router.push(ids.length === 1 ? `/admin/inventory/batches/${ids[0]}` : "/admin/inventory?received=1");
      } catch {
        setError("The request did not complete — check the stock list before trying again, so nothing is received twice.");
      }
    });
  }

  return (
    <div className="space-y-5">
      {pendingUploads.length > 0 && (
        <Card className="p-5">
          <CardTitle>Uploaded, not yet received</CardTitle>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
            An invoice uploaded earlier that hasn&apos;t become a delivery yet — pick it up here rather than finding
            and dropping the file again.
          </p>
          <div className="mt-3 space-y-2">
            {pendingUploads.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--r-sm)] border p-2.5" style={{ borderColor: "var(--border)" }}>
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium">{u.fileName}</p>
                  <p className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
                    uploaded {formatInstant(new Date(u.uploadedAt))}
                    {u.status === "could_not_read" && u.errorMessage ? ` · ${u.errorMessage}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusChip tone={STATUS_TONE[u.status]}>{STATUS_LABEL[u.status]}</StatusChip>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => resumeUpload(u.id)}>
                    Process this
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-5">
        <CardTitle>The invoice</CardTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Supplier" htmlFor="rc-supplier">
            <select id="rc-supplier" className="field" value={head.supplierId} onChange={(e) => setHead((h) => ({ ...h, supplierId: e.target.value }))}>
              <option value="">Choose…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Supplier's invoice number" htmlFor="rc-inv">
            <input id="rc-inv" className="field" value={head.invoiceNumber} onChange={(e) => setHead((h) => ({ ...h, invoiceNumber: e.target.value }))} />
          </Field>
          <Field label="Invoice date" htmlFor="rc-invdate">
            <input id="rc-invdate" type="date" className="field" value={head.invoiceDate} max={today} onChange={(e) => setHead((h) => ({ ...h, invoiceDate: e.target.value }))} />
          </Field>
          <Field label="Invoice total (₹)" htmlFor="rc-total">
            <input id="rc-total" type="number" step="any" className="field num" value={head.total} onChange={(e) => setHead((h) => ({ ...h, total: e.target.value }))} />
          </Field>
          <Field label="Invoice PDF" htmlFor="rc-file" hint="Kept privately with the purchase. The lines below fill in automatically once it's read.">
            <FileDrop id="rc-file" accept="application/pdf" files={file ? [file] : []} onFiles={(f) => onChooseFile(f[0] ?? null)} compact />
            {extracting && (
              <p className="mt-2 text-[13px]" style={{ color: "var(--text-muted)" }}>
                {uploadId ? "Reading the invoice…" : "Uploading…"}
              </p>
            )}
            {!extracting && duplicate && (
              <div className="mt-2 rounded-[var(--r-sm)] border p-2.5 text-[13px]" style={{ borderColor: "var(--warn-fg)", color: "var(--warn-fg)" }}>
                {duplicate.status === "processed" ? (
                  <>
                    This invoice has already been received (uploaded {formatInstant(new Date(duplicate.uploadedAt))}).{" "}
                    {duplicate.firstBatchId && (
                      <a href={`/admin/inventory/batches/${duplicate.firstBatchId}`} className="underline" target="_blank" rel="noreferrer">
                        View it
                      </a>
                    )}
                  </>
                ) : (
                  <>
                    Already uploaded ({formatInstant(new Date(duplicate.uploadedAt))}, not yet processed).{" "}
                    <button type="button" className="underline" onClick={() => resumeUpload(duplicate.id)}>
                      Click here to process
                    </button>
                  </>
                )}
              </div>
            )}
            {!extracting && !duplicate && extractNote && (
              <p className="mt-2 text-[13px]" style={{ color: "var(--text-muted)" }}>
                {uploadFileName && <span className="font-medium">{uploadFileName}: </span>}
                {extractNote}
              </p>
            )}
            {!extracting && !duplicate && uploadId && (
              <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => resumeUpload(uploadId, true)}>
                Re-read this invoice
              </button>
            )}
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <CardTitle>Where and when it arrived</CardTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Office" htmlFor="rc-office">
            <select id="rc-office" className="field" value={head.officeId} onChange={(e) => setHead((h) => ({ ...h, officeId: e.target.value }))}>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Arrived on" htmlFor="rc-on">
            <input id="rc-on" type="date" className="field" value={head.receivedOn} max={today} onChange={(e) => setHead((h) => ({ ...h, receivedOn: e.target.value }))} />
          </Field>
          <Field label="Notes" htmlFor="rc-notes">
            <input id="rc-notes" className="field" value={head.notes} onChange={(e) => setHead((h) => ({ ...h, notes: e.target.value }))} />
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <CardTitle>What arrived — one line per batch</CardTitle>
        <div className="space-y-4">
          {lines.map((l, i) => {
            const item = items.find((x) => x.id === l.itemTypeId);
            return (
              <div key={i} className="rounded-[var(--r-sm)] border p-3" style={{ borderColor: "var(--border)" }}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field
                    label={`Item ${i + 1}`}
                    htmlFor={`rl-item-${i}`}
                    hint={!l.itemTypeId && l.rawDescription ? `From the invoice: "${l.rawDescription}" — nothing matched automatically.` : undefined}
                  >
                    <select
                      id={`rl-item-${i}`}
                      className="field"
                      value={l.itemTypeId}
                      onChange={(e) => {
                        const it = items.find((x) => x.id === e.target.value);
                        setLine(i, { itemTypeId: e.target.value, rawDescription: "", warrantyMonths: it?.defaultWarrantyMonths ? String(it.defaultWarrantyMonths) : l.warrantyMonths });
                      }}
                    >
                      <option value="">Choose…</option>
                      {items.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={`Quantity${item ? ` (${item.unit})` : ""}`} htmlFor={`rl-qty-${i}`}>
                    <input id={`rl-qty-${i}`} type="number" step={item?.tracking === "length" ? "any" : "1"} className="field num" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                  </Field>
                  <Field label={`Cost per ${item?.unit === "m" ? "metre" : "piece"} (₹)`} htmlFor={`rl-cost-${i}`} hint="As on the supplier's invoice, before GST. Values the stock.">
                    <input id={`rl-cost-${i}`} type="number" step="any" className="field num" value={l.unitCost} onChange={(e) => setLine(i, { unitCost: e.target.value })} />
                  </Field>
                  <Field label="Supplier's lot / batch no." htmlFor={`rl-lot-${i}`}>
                    <input id={`rl-lot-${i}`} className="field" value={l.supplierLot} onChange={(e) => setLine(i, { supplierLot: e.target.value })} />
                  </Field>
                  <Field label="Manufactured on" htmlFor={`rl-mfg-${i}`}>
                    <input id={`rl-mfg-${i}`} type="date" className="field" value={l.manufacturedOn} onChange={(e) => setLine(i, { manufacturedOn: e.target.value })} />
                  </Field>
                  <Field label="Warranty (months)" htmlFor={`rl-war-${i}`}>
                    <input id={`rl-war-${i}`} type="number" className="field num" value={l.warrantyMonths} onChange={(e) => setLine(i, { warrantyMonths: e.target.value })} />
                  </Field>
                  <Field label="Warranty runs from" htmlFor={`rl-basis-${i}`}>
                    <select id={`rl-basis-${i}`} className="field" value={l.warrantyBasis} onChange={(e) => setLine(i, { warrantyBasis: e.target.value as Line["warrantyBasis"] })}>
                      <option value="purchase">The invoice date</option>
                      <option value="install">Installation</option>
                    </select>
                  </Field>
                </div>
                {item?.tracking === "serial" && (
                  <div className="mt-3">
                    <Field
                      label="Manufacturer serials (optional)"
                      htmlFor={`rl-serials-${i}`}
                      hint="One per line, in the order the units are numbered — a SIM's ICCID, a meter's device id. Leave blank for lights, or scan each device's own printed serial as it's unboxed."
                    >
                      <textarea id={`rl-serials-${i}`} className="field font-mono text-[12.5px]" rows={3} value={l.serials} onChange={(e) => setLine(i, { serials: e.target.value })} />
                    </Field>
                    <div className="mt-2">
                      <SerialScanButton
                        label="Scan a serial to add it"
                        onScan={(code) =>
                          setLine(i, { serials: l.serials.trim() ? `${l.serials.replace(/\s+$/, "")}\n${code}` : code })
                        }
                      />
                    </div>
                  </div>
                )}
                {lines.length > 1 && (
                  <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                    Remove line
                  </button>
                )}
              </div>
            );
          })}
          <button type="button" className="btn-secondary btn-sm" onClick={() => setLines((ls) => [...ls, blankLine()])}>
            + Add another item
          </button>
        </div>
      </Card>

      {error && <ErrorText>{error}</ErrorText>}
      <button type="button" className="btn-primary" disabled={pending} onClick={submit}>
        {pending ? "Receiving…" : "Receive stock"}
      </button>
    </div>
  );
}
