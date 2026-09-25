"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardTitle, ErrorText, Field } from "@/components/ui";
import { FmCompanyPicker } from "@/components/fm-company-picker";
import { setSocietyFmCompany } from "@/app/admin/facility-management/actions";

type Span = { id: string; companyId: string; companyName: string; startedOn: string; endedOn: string | null; endReason: string | null };

const fmt = (s: string) => s.slice(0, 10).split("-").reverse().join("-");

/** Who runs this society's facilities, and who did before (2026-09-25). */
export function SocietyFmCard({
  societyId,
  spans,
  companies,
  canEdit,
  today,
}: {
  societyId: string;
  spans: Span[];
  companies: { id: string; name: string }[];
  canEdit: boolean;
  today: string;
}) {
  const router = useRouter();
  const current = spans.find((s) => !s.endedOn) ?? null;
  const past = spans.filter((s) => s.endedOn);
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(current?.companyId ?? null);
  const [since, setSince] = useState(today);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card className="p-6 min-w-0">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle className="mb-0">Facility management</CardTitle>
        {canEdit && !open && (
          <button type="button" className="text-[13px] font-semibold" style={{ color: "var(--accent)" }} onClick={() => setOpen(true)}>
            {current ? "Change" : "Record the company"}
          </button>
        )}
      </div>
      {current ? (
        <p className="text-[14px]">
          <Link href={`/admin/facility-management/${current.companyId}`} className="font-semibold">{current.companyName}</Link>
          <span style={{ color: "var(--text-subtle)" }}> · since {fmt(current.startedOn)}</span>
        </p>
      ) : (
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No facility management company recorded.</p>
      )}
      {past.length > 0 && (
        <ul className="mt-2 space-y-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          {past.map((s) => (
            <li key={s.id}>
              <Link href={`/admin/facility-management/${s.companyId}`}>{s.companyName}</Link> · {fmt(s.startedOn)} – {fmt(s.endedOn!)}
              {s.endReason ? ` · ${s.endReason}` : ""}
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div className="mt-3 space-y-3 border-t pt-3" style={{ borderColor: "var(--border-subtle)" }}>
          <Field label="Company" htmlFor="sfm-company">
            <FmCompanyPicker id="sfm-company" companies={companies} value={companyId} onChange={setCompanyId} />
          </Field>
          {/* A date only means something once there is a change to date:
              a company picked, or the current one being cleared. */}
          {(companyId || current) && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={companyId ? "Running it since" : `${current!.companyName} stopped on`}
              htmlFor="sfm-since"
              hint={companyId ? undefined : "The last day they ran this society."}
            >
              <input id="sfm-since" type="date" className="field" max={today} value={since} onChange={(e) => setSince(e.target.value)} />
            </Field>
            {current && (
              <Field label={`Why ${current.companyName} left (optional)`} htmlFor="sfm-reason">
                <input id="sfm-reason" className="field" value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
            )}
          </div>
          )}
          {companyId === null && current && (
            <p className="text-[12.5px]" style={{ color: "var(--warn-fg)" }}>
              No company picked — saving records that {current.companyName} no longer runs this society. Their time here stays in the history.
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={pending || (!companyId && !current)}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  // Clearing: the date typed is their LAST day, so the change takes effect the day after.
                  const effective = companyId ? since : new Date(Date.parse(`${since}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
                  const r = await setSocietyFmCompany(societyId, companyId, effective, reason);
                  if (r.error) return setError(r.error);
                  setOpen(false);
                  setReason("");
                  router.refresh();
                })
              }
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => { setOpen(false); setCompanyId(current?.companyId ?? null); setError(null); }}>
              Cancel
            </button>
          </div>
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      )}
    </Card>
  );
}
