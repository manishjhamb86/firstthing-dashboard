"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { sendCloseEmail } from "../../actions";

type Person = { id: string; name: string; email: string; role: string };

/** The message as it will go out, who gets it, and the one Send. */
export function CloseEmailComposer({
  societyId, period, societyName, subject, body, attachments, people, canSend, emailConfigured, from, backHref,
}: {
  societyId: string; period: string; societyName: string; subject: string; body: string; attachments: string[];
  people: Person[]; canSend: boolean; emailConfigured: boolean; from: string | null; backHref: string;
}) {
  const router = useRouter();
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<number | null>(null);
  const chosen = people.filter((p) => !off[p.id]);

  if (sentTo !== null) {
    return (
      <section className="card flex flex-col items-center gap-3 p-8 text-center sm:p-12">
        <span aria-hidden className="inline-flex h-14 w-14 items-center justify-center rounded-full text-[26px] font-bold" style={{ background: "var(--ok-bg)", color: "var(--ok-fg)" }}>✓</span>
        <h2 className="text-[20px] font-bold">Sent to {sentTo} member{sentTo === 1 ? "" : "s"}</h2>
        <p className="max-w-[520px] text-[14px] text-[var(--text-muted)]">{societyName} is closed for the month: report published, bill released, both emailed. The sent message is kept on the society&apos;s record.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href={`/admin/billing/close?period=${period}`} className="btn-primary">Back to all societies</Link>
          <Link href={backHref} className="btn-secondary">Stay on {societyName}</Link>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-wrap items-start gap-5">
      <section aria-label="Message" className="card min-w-0 overflow-hidden" style={{ flex: "999 1 520px" }}>
        <div className="flex flex-col gap-2 border-b border-[var(--border)] p-5 text-[14px]">
          <div className="flex flex-wrap gap-x-3"><span className="min-w-16 text-[var(--text-muted)]">From</span><span>{from ?? "— not set up"}</span></div>
          <div className="flex flex-wrap gap-x-3"><span className="min-w-16 text-[var(--text-muted)]">To</span><span className="break-all">{chosen.length ? chosen.map((p) => p.email).join(", ") : "Nobody chosen"}</span></div>
          <div className="flex flex-wrap gap-x-3"><span className="min-w-16 text-[var(--text-muted)]">Subject</span><strong>{subject}</strong></div>
        </div>
        <p className="whitespace-pre-line p-5 text-[14.5px] leading-relaxed">{body}</p>
        <div className="flex flex-wrap gap-2 border-t border-[var(--border)] p-4">
          {attachments.map((a) => (
            <span key={a} className="inline-flex items-center gap-2 rounded-[var(--r-md)] border border-[var(--border)] px-3 py-2 text-[13px]">
              <FileText size={16} aria-hidden /> {a}
            </span>
          ))}
        </div>
      </section>

      <aside aria-label="Send" className="flex flex-col gap-4" style={{ flex: "1 1 280px", maxWidth: 380 }}>
        <section className="card flex flex-col gap-2 p-5">
          <h2 className="mb-1 text-[15px] font-bold">Send to</h2>
          {people.length === 0 ? (
            <p className="text-[13.5px] text-[var(--text-muted)]">
              Nobody on {societyName}&apos;s member register has an email address. Add one to a member on the society page first.
            </p>
          ) : (
            people.map((p) => (
              <label key={p.id} className="flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[var(--r-md)] border border-[var(--field-border)] px-3 py-1.5 text-[13.5px]">
                <input type="checkbox" checked={!off[p.id]} onChange={() => setOff({ ...off, [p.id]: !off[p.id] })} className="h-[18px] w-[18px]" />
                <span><strong>{p.name}</strong> · {p.role}<br /><span className="text-[var(--text-muted)]">{p.email}</span></span>
              </label>
            ))
          )}
          <p className="text-[12.5px] text-[var(--text-muted)]">From the society&apos;s member register.</p>
        </section>
        <section className="card flex flex-col gap-3 p-5">
          {!emailConfigured ? (
            <p className="text-[13.5px]" style={{ color: "var(--warn-fg)" }}>Email is not set up on this server yet — see Settings → Email.</p>
          ) : !canSend ? (
            <p className="text-[13.5px] text-[var(--text-muted)]">Sending is an operations lead action.</p>
          ) : (
            <button
              type="button"
              className="btn-primary"
              disabled={pending || chosen.length === 0}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await sendCloseEmail({ societyId, period, recipients: chosen.map((p) => p.email) });
                  if (r.error) return setError(r.error);
                  setSentTo(r.sentTo ?? chosen.length);
                  router.refresh();
                })
              }
            >
              {pending ? "Sending…" : chosen.length === 0 ? "Choose who gets it" : `Send to ${chosen.length} ${chosen.length === 1 ? "person" : "people"}`}
            </button>
          )}
          {error && <p role="alert" className="text-[13px]" style={{ color: "var(--bad-fg)" }}>{error}</p>}
          <p className="text-[12.5px] text-[var(--text-muted)]">
            The same message goes to every society, filled in with this month&apos;s figures. <Link href="/admin/settings/monthly-email" className="font-semibold" style={{ color: "var(--accent)" }}>Change the template</Link>
          </p>
        </section>
      </aside>
    </div>
  );
}
