import { formatDate, formatDateTime } from "@/lib/format-date";

export type SurveyVisit = {
  assigneeName: string;
  assigneeTeam: string;
  assignedAt: Date | null;
  assignedByName: string | null;
  scheduledAt: Date | null;
  contactName: string | null;
  contactPhone: string | null;
  note: string | null;
  /** The deal's own contact, used when no separate site contact was recorded. */
  leadContactName: string;
  leadContactPhone: string | null;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--text-muted)] shrink-0">{label}</dt>
      <dd className="text-right min-w-0">{children}</dd>
    </div>
  );
}

/**
 * Who is going, when, and who to ask for at the gate.
 *
 * Every one of these was invisible until now: "assigned to Inspector" with no
 * date and no arranger could not be told from something the system had
 * inferred, and the visit slot the assignee agreed on the phone lived only in
 * their own head (user-asked 2026-08-25). The contact falls back to the
 * deal's own rather than showing a blank, because arriving with SOMEONE to
 * call beats arriving with nobody.
 */
export function SurveyVisitDetails({ visit }: { visit: SurveyVisit }) {
  const usingLeadContact = !visit.contactName;
  const name = visit.contactName ?? visit.leadContactName;
  const phone = visit.contactName ? visit.contactPhone : visit.leadContactPhone;

  return (
    <dl className="space-y-2.5 text-sm">
      <Row label="Assigned to">
        {visit.assigneeName}
        <span className="block text-xs text-[var(--text-muted)]">{visit.assigneeTeam}</span>
      </Row>
      <Row label="Assigned">
        {visit.assignedAt ? (
          <>
            <span className="num">{formatDate(visit.assignedAt)}</span>
            {visit.assignedByName && (
              <span className="block text-xs text-[var(--text-muted)]">
                by {visit.assignedByName}
              </span>
            )}
          </>
        ) : (
          <span className="text-[var(--text-muted)]">no record of when</span>
        )}
      </Row>
      <Row label="Visit">
        {visit.scheduledAt ? (
          <span className="num">{formatDateTime(visit.scheduledAt)}</span>
        ) : (
          <span style={{ color: "var(--warn-fg)" }}>Not scheduled yet</span>
        )}
      </Row>
      <Row label="Ask for">
        {name}
        {phone ? ` · ${phone}` : ""}
        {usingLeadContact && (
          <span className="block text-xs text-[var(--text-muted)]">
            the deal contact — no separate site contact recorded
          </span>
        )}
      </Row>
      {visit.note && (
        <div>
          <dt className="text-[var(--text-muted)] mb-1">On arrival</dt>
          <dd>{visit.note}</dd>
        </div>
      )}
    </dl>
  );
}
