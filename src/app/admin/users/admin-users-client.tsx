"use client";

import { useState, useTransition } from "react";
import type { AdminTeam } from "@prisma/client";
import { TEAM_PERMISSIONS, TEAMS, missingTeamPermissions, teamMeta } from "@/lib/admin-teams";
import { useRouter, useSearchParams } from "next/navigation";
import { ListToolbar } from "@/components/list-toolbar";
import { SearchInput } from "@/components/search-input";
import type { AdminPermission } from "@prisma/client";
import { ErrorText, Field, StatusChip } from "@/components/ui";
import { Modal } from "@/components/modal";
import { PERMISSION_OPTIONS } from "./permission-options";
import {
  createAdminUser,
  deleteAdminUser,
  restoreAdminUser,
  updateAdminUser,
} from "./admin-actions";

export type AdminListRow = {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  removed: boolean;
  permissions: AdminPermission[];
  team: AdminTeam;
};

const LABEL = new Map(PERMISSION_OPTIONS.map((p) => [p.value, p.label]));
const PERM_LABEL = LABEL;

/**
 * One form, two modes. "Add" opens it empty and "Edit" opens it populated —
 * the user's own framing, and it means there is a single place where an
 * account's shape is described.
 *
 * Email and password only appear when creating: updateAdminUser deliberately
 * does not accept either (changing the address someone signs in with, or
 * their password, from an account-management screen is a different act with
 * different consequences), so offering the fields in edit mode would be
 * offering something the server will not do.
 */
function AdminForm({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing: AdminListRow | null;
}) {
  const isEdit = editing !== null;
  const [name, setName] = useState(editing?.name ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [password, setPassword] = useState("");
  const [team, setTeam] = useState<AdminTeam>(editing?.team ?? "sales");
  // A new account starts with what its team actually needs, rather than five
  // unchecked boxes none of which names the team just chosen.
  const [perms, setPerms] = useState<AdminPermission[]>(
    editing?.permissions ?? TEAM_PERMISSIONS[editing?.team ?? "sales"],
  );
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function toggle(p: AdminPermission) {
    setPerms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }

  /**
   * Changing the team swaps the grants that came FROM a team and leaves
   * anything granted by hand alone — an ops account that was also given
   * manage_admins keeps it when it moves to finance, but stops carrying
   * operations' own three.
   */
  function changeTeam(next: AdminTeam) {
    const fromOldTeam = TEAM_PERMISSIONS[team];
    setPerms((cur) => [
      ...new Set([...cur.filter((p) => !fromOldTeam.includes(p)), ...TEAM_PERMISSIONS[next]]),
    ]);
    setTeam(next);
  }

  const missing = missingTeamPermissions(team, perms);

  function submit() {
    setError(undefined);
    startTransition(async () => {
      const result = isEdit
        ? await updateAdminUser({ id: editing.id, name, permissions: perms, isActive, team })
        : await createAdminUser({ email, name, password, permissions: perms, team });
      if (result && "error" in result && result.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${editing.name ?? editing.email}` : "New admin account"}
      description={
        isEdit
          ? "Permissions take effect on this account's next request — no re-login needed."
          : "An internal ops, support or management account."
      }
      footer={
        <>
          <button type="button" onClick={submit} disabled={pending} className="btn-primary">
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create admin"}
          </button>
          <button type="button" onClick={onClose} disabled={pending} className="btn-ghost">
            Cancel
          </button>
        </>
      }
    >
      {/* The team decides what this account can be HANDED — a lead only goes
          to admin or sales, a survey only to the field. Permissions still
          decide what it may do. */}
      <Field
        label="Team"
        htmlFor="af-team"
        hint={teamMeta(team).scope}
      >
        <select
          id="af-team"
          className="field"
          value={team}
          onChange={(e) => changeTeam(e.target.value as AdminTeam)}
        >
          {TEAMS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label} ({t.persona})
            </option>
          ))}
        </select>
      </Field>

      <Field label="Name" htmlFor="af-name">
        <input id="af-name" className="field" value={name} onChange={(e) => setName(e.target.value)} disabled={pending} />
      </Field>

      <Field
        label="Email"
        htmlFor="af-email"
        hint={isEdit ? "The sign-in address cannot be changed here." : undefined}
      >
        <input
          id="af-email"
          type="email"
          className="field"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={pending || isEdit}
          readOnly={isEdit}
        />
      </Field>

      {!isEdit && (
        <Field label="Password" htmlFor="af-password" hint="Minimum 8 characters.">
          <input
            id="af-password"
            type="password"
            className="field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={pending}
          />
        </Field>
      )}

      {/* There is no permission called "marketing" — the one a sales account
          needs is manage_pipeline, and nothing said so (user-reported
          2026-08-24). Each grant now states what it buys, and the ones this
          team's own work requires are marked and pre-selected. */}
      <fieldset>
        <legend className="lbl mb-1">Permissions</legend>
        <p className="text-xs text-[var(--text-muted)] mb-2">
          {TEAM_PERMISSIONS[team].length > 0
            ? `${teamMeta(team).label} needs ${TEAM_PERMISSIONS[team]
                .map((p) => PERM_LABEL.get(p) ?? p)
                .join(" and ")}.`
            : `${teamMeta(team).label} has no assignable work of its own yet — grant nothing unless this account also does something else.`}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
          {PERMISSION_OPTIONS.map((p) => {
            const needed = TEAM_PERMISSIONS[team].includes(p.value);
            return (
              <label key={p.value} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={perms.includes(p.value)}
                  onChange={() => toggle(p.value)}
                  disabled={pending}
                />
                <span className="min-w-0">
                  <span className="font-medium">{p.label}</span>
                  {needed && (
                    <span
                      className="ml-1.5 align-middle text-[11px] font-semibold uppercase tracking-wide"
                      style={{ color: "var(--accent)" }}
                    >
                      needed
                    </span>
                  )}
                  <span className="block text-xs text-[var(--text-muted)]">{p.scope}</span>
                </span>
              </label>
            );
          })}
        </div>
        {missing.length > 0 && (
          <p className="text-xs mt-2" style={{ color: "var(--warn-fg)" }}>
            Without {missing.map((p) => PERM_LABEL.get(p) ?? p).join(" and ")}, this account cannot
            do its own team&apos;s work
            {missing.includes("manage_pipeline") ? " — it will not appear when assigning a lead" : ""}
            .
          </p>
        )}
      </fieldset>

      {isEdit && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={pending} />
          Active — may sign in
        </label>
      )}

      {error && <ErrorText>{error}</ErrorText>}
    </Modal>
  );
}

function matchesQuery(row: AdminListRow, q: string, labels: Map<string, string>) {
  if (!q) return true;
  // Searching a permission by its label is the useful case: "who can release
  // billing" is a question this list should be able to answer.
  const perms = row.permissions.map((p) => labels.get(p) ?? p).join(" ");
  return `${row.name ?? ""} ${row.email} ${perms} ${teamMeta(row.team).label}`.toLowerCase().includes(q.toLowerCase());
}

export function AdminUsersClient({ rows, selfId }: { rows: AdminListRow[]; selfId: string }) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<AdminListRow | null>(null);
  // The Add button is in the page header with every other page's, so it
  // signals through the URL rather than this component's state.
  const router = useRouter();
  const searchParams = useSearchParams();
  const creating = searchParams.get("new") === "1";
  const closeCreate = () => router.replace("/admin/users");
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const live = rows.filter((r) => !r.removed && matchesQuery(r, q, LABEL));
  const removed = rows.filter((r) => r.removed && matchesQuery(r, q, LABEL));

  function act(id: string, fn: () => Promise<{ error?: string } | void>) {
    setRowError(null);
    startTransition(async () => {
      const result = await fn();
      if (result && "error" in result && result.error) setRowError({ id, message: result.error });
    });
  }

  function remove(row: AdminListRow) {
    if (!window.confirm(`Remove ${row.name ?? row.email}? They stop being able to sign in. Everything they recorded keeps their name.`)) return;
    act(row.id, () => deleteAdminUser(row.id));
  }

  return (
    <>
      <ListToolbar>
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Search name, email or permission…"
          label="Search admin accounts"
        />
      </ListToolbar>

      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Account</th>
              <th>Permissions</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {live.length === 0 && (
              <tr>
                <td colSpan={4} className="text-[var(--text-muted)]">
                  Nothing matches &ldquo;{q}&rdquo;.
                </td>
              </tr>
            )}
            {live.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className="font-medium">{r.name ?? "—"}</span>
                  {r.id === selfId && <span className="text-[var(--text-muted)]"> (you)</span>}
                  <p className="text-[13px] text-[var(--text-muted)]">
                    {r.email} · {teamMeta(r.team).label}
                  </p>
                  {rowError?.id === r.id && <ErrorText>{rowError.message}</ErrorText>}
                </td>
                <td>
                  {r.permissions.length === 0 ? (
                    <span className="text-[var(--text-muted)]">None</span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {r.permissions.map((p) => (
                        <StatusChip key={p} tone="neu">
                          {LABEL.get(p) ?? p}
                        </StatusChip>
                      ))}
                    </span>
                  )}
                </td>
                <td>
                  {r.isActive ? (
                    <StatusChip tone="ok">Active</StatusChip>
                  ) : (
                    <StatusChip tone="warn">Disabled</StatusChip>
                  )}
                </td>
                <td className="text-right whitespace-nowrap">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(r)} disabled={pending}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    disabled={pending}
                    onClick={() =>
                      act(r.id, () =>
                        updateAdminUser({ id: r.id, name: r.name ?? "", permissions: r.permissions, isActive: !r.isActive, team: r.team }),
                      )
                    }
                  >
                    {r.isActive ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    style={{ color: "var(--bad-fg)" }}
                    disabled={pending || r.id === selfId}
                    title={r.id === selfId ? "You cannot remove your own account" : undefined}
                    onClick={() => remove(r)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* A removal that hides the row completely is indistinguishable from a
          real delete — the same reason removed circuits stay visible in a
          disclosure on their own registry. */}
      {removed.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-[var(--text-muted)]">
            {removed.length} removed account{removed.length === 1 ? "" : "s"}
          </summary>
          <div className="card overflow-x-auto mt-3">
            <table className="tbl">
              <tbody>
                {removed.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="font-medium line-through">{r.name ?? r.email}</span>
                      <p className="text-[13px] text-[var(--text-muted)]">{r.email}</p>
                      {rowError?.id === r.id && <ErrorText>{rowError.message}</ErrorText>}
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        disabled={pending}
                        onClick={() => act(r.id, () => restoreAdminUser(r.id))}
                      >
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {creating && <AdminForm open onClose={() => closeCreate()} editing={null} />}
      {editing && <AdminForm key={editing.id} open onClose={() => setEditing(null)} editing={editing} />}
    </>
  );
}
