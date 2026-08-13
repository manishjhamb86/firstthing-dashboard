"use client";

import { useState } from "react";
import { UploadCloud } from "lucide-react";
import { TONE_VARS } from "@/components/shell/StatusChip";
import InvoiceUploadPanel from "../invoice-upload-panel";
import SimpleUploadPanel from "../simple-upload-panel";
import DocTypePicker from "../doc-type-picker";
import { DOC_TYPE_LABEL, DOC_TYPE_ICON, DOC_TYPE_TONE, DOC_TYPE_DESC, type DocType } from "../doc-type-meta";

type Society = { id: number; name: string };

export default function DocumentsUploadClient({ societies }: { societies: Society[] }) {
  const [uploadType, setUploadType] = useState<DocType>("invoice");
  const activeTone = TONE_VARS[DOC_TYPE_TONE[uploadType]];
  const ActiveIcon = DOC_TYPE_ICON[uploadType];

  return (
    <div className="w-full max-w-3xl">
      <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]"
            style={{ background: "var(--ib)", color: "var(--if)" }}
          >
            <UploadCloud size={19} />
          </div>
          <div>
            <div className="text-sm font-bold text-ink">Upload a document</div>
            <div className="text-xs text-m2">
              Pick what you&apos;re uploading below — invoices are read automatically by AI, other document types are
              entered manually. Once saved, it appears in the Documents list.
            </div>
          </div>
        </div>

        <DocTypePicker value={uploadType} onChange={setUploadType} />

        <div
          className="flex items-start gap-2.5 rounded-[10px] border-l-[3px] px-3.5 py-2.5"
          style={{ borderColor: activeTone.fg, background: activeTone.bg }}
        >
          <ActiveIcon size={15} style={{ color: activeTone.fg }} className="mt-0.5 shrink-0" />
          <div className="text-xs" style={{ color: activeTone.fg }}>
            <span className="font-bold">{DOC_TYPE_LABEL[uploadType]}.</span> {DOC_TYPE_DESC[uploadType]}.
          </div>
        </div>

        {uploadType === "invoice" && <InvoiceUploadPanel societies={societies} />}
        {(uploadType === "savingsReport" || uploadType === "inspectionReport") && (
          <SimpleUploadPanel docType={uploadType} societies={societies} />
        )}
      </div>
    </div>
  );
}
