"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, ErrorText, Field, StatusChip } from "@/components/ui";
import { Modal } from "@/components/modal";
import { addMember, createMemberPortalAccess, endMember, replaceMember, updateMember } from "./actions";

export type MemberRow = {
  id: string;
  name: string;
  mobile: string;
  mobileLabel: string;
  email: string;
  positionId: string;
  position: string;
  positionOrder: number;
  startedOn: string;
  startedLabel: string | null;
  notes: string;
  current: boolean;
  endedLabel: string | null;
  endReason: string | null;
  replacedBy: string | null;
  portal: string | null;
  portalAuthority: string | null;
};

type Person = { name: string; mobile: string; email: string; positionId: string; newPosition: string; startedOn: string; notes: string };
const NEW = "__new__";
const blank = (today: string): Person => ({ name: "", mobile: "", email: "", positionId: "", newPosition: "", startedOn: today, notes: "" });

/** The person fields, shared by add, edit and the successor in a replace. */
function PersonFields({ v, set, positions, idPrefix, showStarted = true }: { v: Person; set: (p: Partial<Person>) => void; positions: { id: string; name: string }[]; idPrefix: string; showStarted?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Name" htmlFor={`${idPrefix}-name`}>
        <input id={`${idPrefix}-name`} className="field" value={v.name} onChange={(e) => set({ name: e.target.value })} />
      </Field>
      <Field label="Position" htmlFor={`${idPrefix}-position`}>
        <select
          id={`${idPrefix}-position`}
          className="field"
          value={v.positionId || (v.newPosition ? NEW : "")}
          onChange={(e) => (e.target.value === NEW ? set({ positionId: "", newPosition: " " }) : set({ positionId: e.target.value, newPosition: "" }))}
        >
          <option value="">Choose…</option>
          {positions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value={NEW}>Add a new position…</option>
        </select>
      </Field>
      {!v.positionId && v.newPosition !== "" && (
        <Field label="New position" htmlFor={`${idPrefix}-newpos`} hint="Added to the list for everyone.">
          <input id={`${idPrefix}-newpos`} className="field" value={v.newPosition.trimStart()} onChange={(e) => set({ newPosition: e.target.value || " " })} />
        </Field>
      )}
      <Field label="Mobile" htmlFor={`${idPrefix}-mobile`}>
        <input id={`${idPrefix}-mobile`} type="tel" className="field num" value={v.mobile} onChange={(e) => set({ mobile: e.target.value })} placeholder="98110 22159" />
      </Field>
      <Field label="Email (optional)" htmlFor={`${idPrefix}-email`} hint="Needed only for a portal login.">
        <input id={`${idPrefix}-email`} type="email" className="field" value={v.email} onChange={(e) => set({ email: e.target.value })} />
      </Field>
      {showStarted && (
        <Field label="In this position since (optional)" htmlFor={`${idPrefix}-since`}>
          <input id={`${idPrefix}-since`} type="date" className="field" value={v.startedOn} onChange={(e) => set({ startedOn: e.target.value })} />
        </Field>
      )}
      <Field label="Notes (optional)" htmlFor={`${idPrefix}-notes`}>
        <input id={`${idPrefix}-notes`} className="field" value={v.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
    </div>
  );
}

type Dialog =
  | { kind: "add"; v: Person; profileId?: string }
  | { kind: "edit"; row: MemberRow; v: Person }
  | { kind: "end"; row: MemberRow; endedOn: string; reason: string; deactivatePortal: boolean }
  | { kind: "replace"; row: MemberRow; endedOn: string; reason: string; deactivatePortal: boolean; v: Person }
  | { kind: "portal"; row: MemberRow; authority: "committee" | "manager" | "office_bearer"; grants: string[] }
  | { kind: "password"; email: string; password: string };

export function MembersClient({
  societyId,
  rows,
  positions,
  unlinkedAccounts,
  grants,
  canPortal,
  today,
}: {
  societyId: string;
  rows: MemberRow[];
  positions: { id: string; name: string }[];
  unlinkedAccounts: { id: string; name: string; email: string; authority: string }[];
  grants: { id: string; label: string }[];
  canPortal: boolean;
  today: string;
}) {
  const router = useRouter();
  const [showPast, setShowPast] = useState(false);
  const [d, setD] = useState<Dialog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const current = rows.filter((r) => r.current);
  const past = rows.filter((r) => !r.current);

  function run(fn: () => Promise<{ error?: string; email?: string; password?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.error) return setError(r.error);
      router.refresh();
      setD(r.password && r.email ? { kind: "password", email: r.email, password: r.password } : null);
    });
  }
  const toPerson = (r: MemberRow): Person => ({ name: r.name, mobile: r.mobileLabel, email: r.email, positionId: r.positionId, newPosition: "", startedOn: r.startedOn, notes: r.notes });

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-3">
          <p className="text-[15px] font-bold">Current members ({current.length})</p>
          <button type="button" className="btn-primary btn-sm" onClick={() => { setError(null); setD({ kind: "add", v: blank(today) }); }}>
            Add member
          </button>
        </div>
        {current.length === 0 ? (
          <p className="px-5 pb-5 text-[13.5px]" style={{ color: "var(--text-muted)" }}>No members recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Position</th>
                  <th>Mobile</th>
                  <th>Email</th>
                  <th>Since</th>
                  <th>Portal</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {current.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">
                      {r.name}
                      {r.notes && <p className="text-[12px] font-normal" style={{ color: "var(--text-subtle)" }}>{r.notes}</p>}
                    </td>
                    <td>{r.position}</td>
                    <td className="num whitespace-nowrap">
                      <a href={`tel:+91${r.mobile}`}>{r.mobileLabel}</a>
                    </td>
                    <td>{r.email ? <a href={`mailto:${r.email}`}>{r.email}</a> : "—"}</td>
                    <td className="whitespace-nowrap">{r.startedLabel ?? "—"}</td>
                    <td>
                      {r.portal ? (
                        <StatusChip tone="info">{r.portal}</StatusChip>
                      ) : canPortal && r.email ? (
                        <button type="button" className="btn-ghost btn-sm" onClick={() => { setError(null); setD({ kind: "portal", row: r, authority: "committee", grants: ["electricity", "documents"] }); }}>
                          Give portal access
                        </button>
                      ) : (
                        <span className="text-[12px]" style={{ color: "var(--text-subtle)" }}>{r.email ? "—" : "No email"}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <button type="button" className="btn-ghost btn-sm" onClick={() => { setError(null); setD({ kind: "edit", row: r, v: toPerson(r) }); }}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => { setError(null); setD({ kind: "replace", row: r, endedOn: today, reason: "", deactivatePortal: true, v: { ...blank(today), positionId: r.positionId } }); }}
                      >
                        Replace
                      </button>
                      <button type="button" className="btn-ghost btn-sm" onClick={() => { setError(null); setD({ kind: "end", row: r, endedOn: today, reason: "", deactivatePortal: true }); }}>
                        End
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {unlinkedAccounts.length > 0 && (
        <Card className="p-5">
          <p className="mb-1 text-[14px] font-bold">Portal accounts not on the member list</p>
          <p className="mb-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            These people can sign in to the portal but are not recorded as members. Add them with their position and mobile.
          </p>
          <ul className="space-y-2 text-[13.5px]">
            {unlinkedAccounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{a.name || a.email}</span>
                <span style={{ color: "var(--text-subtle)" }}>
                  {a.email} · {a.authority}
                </span>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => { setError(null); setD({ kind: "add", v: { ...blank(today), name: a.name, email: a.email }, profileId: a.id }); }}
                >
                  Add as member
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {past.length > 0 && (
        <Card className="overflow-hidden">
          <button type="button" className="flex w-full items-center justify-between p-5 text-left" onClick={() => setShowPast((s) => !s)} aria-expanded={showPast}>
            <span className="text-[14px] font-bold">Past members ({past.length})</span>
            <span className="text-[13px]" style={{ color: "var(--accent)" }}>{showPast ? "Hide" : "Show"}</span>
          </button>
          {showPast && (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Position</th>
                    <th>Mobile</th>
                    <th>From – to</th>
                    <th>Why</th>
                  </tr>
                </thead>
                <tbody>
                  {past.map((r) => (
                    <tr key={r.id} style={{ color: "var(--text-muted)" }}>
                      <td className="font-medium">{r.name}</td>
                      <td>{r.position}</td>
                      <td className="num whitespace-nowrap">{r.mobileLabel}</td>
                      <td className="whitespace-nowrap">
                        {r.startedLabel ?? "—"} – {r.endedLabel}
                      </td>
                      <td>
                        {r.endReason}
                        {r.replacedBy && <span> · replaced by {r.replacedBy}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Add / edit */}
      <Modal
        open={d?.kind === "add" || d?.kind === "edit"}
        onClose={() => setD((x) => (x?.kind === "add" || x?.kind === "edit" ? null : x))}
        title={d?.kind === "edit" ? `Correct ${d.row.name}'s record` : "Add member"}
        description={d?.kind === "edit" ? "For correcting a detail. If someone else now holds the position, use Replace instead." : undefined}
        size="wide"
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setD(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={pending}
              onClick={() =>
                d?.kind === "add"
                  ? run(() => addMember(societyId, { ...d.v, profileId: d.profileId }))
                  : d?.kind === "edit"
                    ? run(() => updateMember(d.row.id, d.v))
                    : undefined
              }
            >
              {pending ? "Saving…" : d?.kind === "edit" ? "Save" : "Add member"}
            </button>
          </>
        }
      >
        {(d?.kind === "add" || d?.kind === "edit") && (
          <div className="space-y-3">
            <PersonFields v={d.v} set={(p) => setD((x) => (x && (x.kind === "add" || x.kind === "edit") ? { ...x, v: { ...x.v, ...p } } : x))} positions={positions} idPrefix="mb" />
            {error && <ErrorText>{error}</ErrorText>}
          </div>
        )}
      </Modal>

      {/* End / replace */}
      <Modal
        open={d?.kind === "end" || d?.kind === "replace"}
        onClose={() => setD((x) => (x?.kind === "end" || x?.kind === "replace" ? null : x))}
        title={d?.kind === "replace" ? `Replace ${d.row.name} (${d.row.position})` : d?.kind === "end" ? `${d.row.name} is no longer ${d.row.position}` : ""}
        description="They stay on record as a past member."
        size="wide"
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setD(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={pending}
              onClick={() =>
                d?.kind === "end"
                  ? run(() => endMember(d.row.id, { endedOn: d.endedOn, reason: d.reason, deactivatePortal: d.deactivatePortal }))
                  : d?.kind === "replace"
                    ? run(() => replaceMember(d.row.id, { endedOn: d.endedOn, reason: d.reason, deactivatePortal: d.deactivatePortal, successor: d.v }))
                    : undefined
              }
            >
              {pending ? "Saving…" : d?.kind === "replace" ? "Replace" : "End membership"}
            </button>
          </>
        }
      >
        {(d?.kind === "end" || d?.kind === "replace") && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={d.kind === "replace" ? "Handed over on" : "Stopped on"} htmlFor="mb-ended">
                <input id="mb-ended" type="date" className="field" max={today} value={d.endedOn} onChange={(e) => setD((x) => (x && (x.kind === "end" || x.kind === "replace") ? { ...x, endedOn: e.target.value } : x))} />
              </Field>
              <Field label="Why" htmlFor="mb-reason">
                <input id="mb-reason" className="field" placeholder="Term ended · resigned · moved out" value={d.reason} onChange={(e) => setD((x) => (x && (x.kind === "end" || x.kind === "replace") ? { ...x, reason: e.target.value } : x))} />
              </Field>
            </div>
            {d.row.portal && (
              <label className="flex items-start gap-2 text-[13px]">
                <input type="checkbox" className="mt-0.5" checked={d.deactivatePortal} onChange={(e) => setD((x) => (x && (x.kind === "end" || x.kind === "replace") ? { ...x, deactivatePortal: e.target.checked } : x))} />
                <span>Also deactivate their portal login ({d.row.portal}).</span>
              </label>
            )}
            {d.kind === "replace" && (
              <>
                <p className="text-[13px] font-semibold">Who takes over</p>
                <PersonFields v={d.v} set={(p) => setD((x) => (x?.kind === "replace" ? { ...x, v: { ...x.v, ...p } } : x))} positions={positions} idPrefix="mb-new" showStarted={false} />
              </>
            )}
            {error && <ErrorText>{error}</ErrorText>}
          </div>
        )}
      </Modal>

      {/* Portal access */}
      <Modal
        open={d?.kind === "portal"}
        onClose={() => setD((x) => (x?.kind === "portal" ? null : x))}
        title={d?.kind === "portal" ? `Portal login for ${d.row.name}` : ""}
        description={d?.kind === "portal" ? `They sign in with ${d.row.email}. Choose what they may see.` : undefined}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setD(null)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={pending} onClick={() => d?.kind === "portal" && run(() => createMemberPortalAccess(d.row.id, { authority: d.authority, grants: d.grants }))}>
              {pending ? "Creating…" : "Create login"}
            </button>
          </>
        }
      >
        {d?.kind === "portal" && (
          <div className="space-y-4">
            <Field label="Authority" htmlFor="pa-authority" hint="The office-bearer sees everything and makes binding decisions; there is only one per society.">
              <select id="pa-authority" className="field" value={d.authority} onChange={(e) => setD((x) => (x?.kind === "portal" ? { ...x, authority: e.target.value as "committee" } : x))}>
                <option value="committee">Committee</option>
                <option value="manager">Manager</option>
                <option value="office_bearer">Office-bearer</option>
              </select>
            </Field>
            {d.authority !== "office_bearer" && (
              <fieldset>
                <legend className="lbl mb-2">What they may see</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {grants.map((g) => (
                    <label key={g.id} className="flex items-center gap-2 text-[13.5px]">
                      <input
                        type="checkbox"
                        checked={d.grants.includes(g.id)}
                        onChange={(e) => setD((x) => (x?.kind === "portal" ? { ...x, grants: e.target.checked ? [...x.grants, g.id] : x.grants.filter((y) => y !== g.id) } : x))}
                      />
                      {g.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {error && <ErrorText>{error}</ErrorText>}
          </div>
        )}
      </Modal>

      <Modal open={d?.kind === "password"} onClose={() => setD((x) => (x?.kind === "password" ? null : x))} title="Login created" description="Give them these details. The password is shown only now.">
        {d?.kind === "password" && (
          <div className="space-y-2 text-[14px]">
            <p>
              Email: <strong>{d.email}</strong>
            </p>
            <p>
              Temporary password: <strong className="font-mono">{d.password}</strong>
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
