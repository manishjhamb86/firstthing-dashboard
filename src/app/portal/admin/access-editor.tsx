"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PortalGrant } from "@prisma/client";
import { Card, CardTitle, ErrorText, InfoNote, StatusChip } from "@/components/ui";
import { GRANT_META } from "@/lib/portal-access";
import { setMemberGrants } from "./grant-actions";
import { MemberAvatar, RoleBadge } from "../member-badges";

type Member = {
  id: string;
  name: string | null;
  email: string;
  authority: string;
  grants: PortalGrant[];
  isSelf: boolean;
};

/**
 * Who can see what (customer portal, 2026-08-29). One member selected at a
 * time; the toggle list IS that member's row expanded — the design defect the
 * canvas review caught (a panel contradicting the row it expands) is
 * structurally impossible here because both render from the same state.
 *
 * Only the office-bearer gets the toggles; a society_admin grantee sees the
 * list read-only. The server re-checks either way (checkGrantEdit).
 */
export function AccessEditor({
  members,
  canEdit,
}: {
  members: Member[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PortalGrant[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  const selected = members.find((m) => m.id === selectedId) ?? null;

  function openFor(m: Member) {
    setSelectedId(m.id);
    setDraft(m.grants);
    setError(undefined);
  }

  function toggle(g: PortalGrant) {
    setDraft((d) => (d.includes(g) ? d.filter((x) => x !== g) : [...d, g]));
  }

  function save() {
    if (!selected) return;
    startTransition(async () => {
      const r = await setMemberGrants(selected.id, draft);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setSelectedId(null);
      router.refresh();
    });
  }

  const grantLabel = (g: PortalGrant) => GRANT_META.find((x) => x.id === g)?.label ?? g;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-12">
      <Card className="p-6 lg:col-span-7">
        <CardTitle>Members &amp; access</CardTitle>
        <div className="flex flex-col">
          {members.map((m, i) => {
            const isOb = m.authority === "office_bearer";
            return (
              <div
                key={m.id}
                // flex-col below sm (2026-10-07, user-caught: "same issue"
                // as the other portal pages) — the name, the grant chips and
                // the Edit button used to share one flex-wrap row, so the
                // chips (justify-end) and the button landed wherever the
                // wrap happened to break on a narrow screen. Each piece gets
                // its own line below sm instead.
                className="flex flex-col gap-2 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4 sm:gap-y-2"
                style={{
                  ...(i < members.length - 1 ? { borderBottom: "1px solid var(--border-subtle)" } : {}),
                  ...(selectedId === m.id ? { background: "var(--accent-subtle)", borderRadius: "var(--r-sm)", padding: "12px" } : {}),
                }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <MemberAvatar name={m.name} email={m.email} />
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold">
                      {m.name ?? m.email}
                      {m.isSelf && (
                        <span className="ml-2 text-[11px] font-medium" style={{ color: "var(--text-subtle)" }}>
                          you
                        </span>
                      )}
                    </p>
                    <div className="mt-0.5">
                      <RoleBadge authority={m.authority} />
                    </div>
                  </div>
                </div>
                <div className="flex min-w-0 flex-wrap gap-1.5 sm:flex-1 sm:justify-end">
                  {isOb ? (
                    <StatusChip tone="info">Everything</StatusChip>
                  ) : m.grants.length === 0 ? (
                    <span className="text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
                      no access yet
                    </span>
                  ) : (
                    m.grants.map((g) => (
                      <span
                        key={g}
                        className="inline-flex items-center rounded-[var(--r-pill)] border px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          borderColor: "var(--accent-line)",
                          background: "var(--accent-subtle)",
                          color: "var(--accent)",
                        }}
                      >
                        {grantLabel(g)}
                      </span>
                    ))
                  )}
                </div>
                {canEdit && !isOb && (
                  <button type="button" className="btn-sm btn-ghost self-start sm:self-auto" onClick={() => openFor(m)}>
                    Edit access
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-6 lg:col-span-5">
        {selected && canEdit ? (
          <>
            <CardTitle className="mb-0">{selected.name ?? selected.email}</CardTitle>
            <p className="mb-3 text-xs" style={{ color: "var(--text-subtle)" }}>
              what they can see and do
            </p>
            <div className="flex flex-col">
              {GRANT_META.map((g) => {
                const on = draft.includes(g.id) || (g.id === "tickets_view" && draft.includes("tickets_manage"));
                const implied = g.id === "tickets_view" && draft.includes("tickets_manage") && !draft.includes("tickets_view");
                return (
                  <label
                    key={g.id}
                    className="flex cursor-pointer items-center justify-between gap-3 py-2.5"
                    style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  >
                    <span>
                      <span className="block text-[13px] font-semibold">{g.label}</span>
                      <span className="block text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
                        {implied ? "included with Tickets — manage" : g.note}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={implied || pending}
                      onChange={() => toggle(g.id)}
                    />
                  </label>
                );
              })}
            </div>
            {error && (
              <div className="mt-3">
                <ErrorText>{error}</ErrorText>
              </div>
            )}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" className="btn-ghost" disabled={pending} onClick={() => setSelectedId(null)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" disabled={pending} onClick={save}>
                {pending ? "Saving…" : "Save access"}
              </button>
            </div>
            <div className="mt-3">
              <InfoNote label="How this works">
                A tab only appears for a member when its access is on. The office-bearer designation
                itself still moves by transfer — exactly one member holds it.
              </InfoNote>
            </div>
          </>
        ) : (
          <>
            <CardTitle>Access</CardTitle>
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {canEdit
                ? "Pick a member to set what they can see — electricity, water tanks, documents, inventory, tickets."
                : "Only the office-bearer can change what members can access. You can see who has what."}
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
