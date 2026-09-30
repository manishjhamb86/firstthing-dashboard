"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { ErrorText, Field } from "@/components/ui";
import { FileDrop } from "@/components/file-drop";
import { createRetailInvoiceManual, getRetailInvoiceUploadUrl } from "../actions";

const today = new Date().toISOString().slice(0, 10);

/** Record a sale directly against this customer — a PDF is optional, so a
 *  deal can be logged the day it happens and the Zoho invoice attached
 *  later, or never, if there isn't one. */
export function NewInvoiceButton({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const blank = {
    invoiceNumber: "",
    period: today.slice(0, 7),
    invoiceDate: today,
    dueDate: "",
    total: "",
    subtotal: "",
    taxAmount: "",
  };
  const [f, setF] = useState(blank);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openIt() {
    setF(blank);
    setFile(null);
    setError(null);
    setOpen(true);
  }
  function save() {
    setError(null);
    startTransition(async () => {
      let fileKey: string | null = null;
      let fileName: string | null = null;
      if (file) {
        const presign = await getRetailInvoiceUploadUrl({
          customerId,
          invoiceNumber: f.invoiceNumber,
          period: f.period,
          fileName: file.name,
          contentType: file.type || "application/pdf",
        });
        if ("error" in presign) return setError(presign.error);
        const put = await fetch(presign.uploadUrl, { method: "PUT", body: file });
        if (!put.ok) return setError("The upload to storage failed — try again.");
        fileKey = presign.key;
        fileName = file.name;
      }
      const r = await createRetailInvoiceManual(customerId, { ...f, fileKey, fileName });
      if ("error" in r) return setError(r.error);
      setOpen(false);
      router.refresh();
    });
  }
  const input = (k: keyof typeof f, id: string, type = "text") => (
    <input id={id} type={type} className="field" value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} />
  );

  return (
    <>
      <button type="button" className="btn-primary btn-sm" onClick={openIt}>
        New invoice
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Record a sale"
        description="With or without a PDF — attach the Zoho invoice now, or leave it and add it later."
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={pending} onClick={save}>
              {pending ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Invoice number" htmlFor="ri-number">{input("invoiceNumber", "ri-number")}</Field>
            <Field label="For the month" htmlFor="ri-period">{input("period", "ri-period", "month")}</Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Invoice date" htmlFor="ri-idate">{input("invoiceDate", "ri-idate", "date")}</Field>
            <Field label="Due date (optional)" htmlFor="ri-ddate">{input("dueDate", "ri-ddate", "date")}</Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Subtotal (optional)" htmlFor="ri-sub">{input("subtotal", "ri-sub", "number")}</Field>
            <Field label="Tax (optional)" htmlFor="ri-tax">{input("taxAmount", "ri-tax", "number")}</Field>
            <Field label="Total (₹)" htmlFor="ri-total">{input("total", "ri-total", "number")}</Field>
          </div>
          <Field label="The invoice PDF (optional)" htmlFor="ri-file">
            <FileDrop id="ri-file" accept="application/pdf,image/*" files={file ? [file] : []} onFiles={(fs) => setFile(fs[0] ?? null)} disabled={pending} hint="PDF or a photo — leave empty if there isn't one yet" />
          </Field>
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      </Modal>
    </>
  );
}
