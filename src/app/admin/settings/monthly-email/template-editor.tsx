"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui";
import { fillTemplate, refuseTemplate, type TemplateWord } from "@/lib/monthly-close";
import { saveMonthlyCloseTemplate } from "@/app/admin/billing/close/actions";

const SAMPLE: Record<TemplateWord, string> = {
  society: "Hyde Park",
  month: "October 2026",
  savings_pct: "64.5%",
  saved_rupees: "₹52,444.00",
  saved_kwh: "7,244 kWh",
  invoice_no: "FT/2026-27/071",
  invoice_total: "₹18,880.00",
  due_date: "20-11-2026",
};

export function TemplateEditor({
  initialSubject, initialBody, words, savedNote, canEdit,
}: { initialSubject: string; initialBody: string; words: { key: string; hint: string }[]; savedNote: string; canEdit: boolean }) {
  const router = useRouter();
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const dirty = subject !== initialSubject || body !== initialBody;
  const problem = refuseTemplate(subject, body);

  return (
    <div className="flex flex-wrap items-start gap-5">
      <section aria-label="Edit template" className="card flex min-w-0 flex-col gap-4 p-5" style={{ flex: "1 1 440px" }}>
        <Field label="Subject" htmlFor="tpl-subject">
          <input id="tpl-subject" className="field" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!canEdit || pending} />
        </Field>
        <Field label="Message" htmlFor="tpl-body">
          <textarea id="tpl-body" className="field" rows={14} value={body} onChange={(e) => setBody(e.target.value)} disabled={!canEdit || pending} style={{ lineHeight: 1.6 }} />
        </Field>
        <div>
          <p className="mb-2 text-[13px] font-semibold">Fill-in words</p>
          <ul className="flex flex-wrap gap-2">
            {words.map((w) => (
              <li key={w.key} className="flex flex-col rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-sunken)] px-2.5 py-1.5 text-[12px]">
                <code style={{ color: "var(--accent)" }}>{`{${w.key}}`}</code>
                <span className="text-[var(--text-muted)]">{w.hint}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-4">
          {canEdit ? (
            <button
              type="button"
              className="btn-primary"
              disabled={!dirty || pending || problem !== null}
              onClick={() =>
                start(async () => {
                  setNote(null);
                  const r = await saveMonthlyCloseTemplate(subject, body);
                  if (r.error) return setNote({ tone: "bad", text: r.error });
                  setNote({ tone: "ok", text: "Saved — every society's next email uses it." });
                  router.refresh();
                })
              }
            >
              {pending ? "Saving…" : "Save template"}
            </button>
          ) : (
            <span className="text-[13px] text-[var(--text-muted)]">Changing the template is an operations lead action.</span>
          )}
          <span role={note?.tone === "bad" || (dirty && problem) ? "alert" : "status"} className="text-[13px]" style={{ color: note?.tone === "bad" || (dirty && problem) ? "var(--bad-fg)" : note ? "var(--ok-fg)" : "var(--text-muted)" }}>
            {dirty && problem ? problem : note?.text ?? (dirty ? "Unsaved changes" : savedNote)}
          </span>
        </div>
      </section>

      <section aria-label="Preview" className="card min-w-0 overflow-hidden" style={{ flex: "1 1 400px" }}>
        <p className="border-b border-[var(--border)] bg-[var(--surface-sunken)] px-5 py-3 text-[13px] text-[var(--text-muted)]">Preview, with sample figures</p>
        <div className="flex flex-col gap-3 p-5">
          <p className="text-[14px]"><span className="text-[var(--text-muted)]">Subject</span> <strong>{fillTemplate(subject, SAMPLE)}</strong></p>
          <p className="whitespace-pre-line text-[14.5px] leading-relaxed">{fillTemplate(body, SAMPLE)}</p>
        </div>
      </section>
    </div>
  );
}
