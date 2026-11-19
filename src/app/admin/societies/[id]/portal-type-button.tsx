"use client";

import { useState, useTransition } from "react";
import type { PortalAuthority, PortalGrant } from "@prisma/client";
import { Modal } from "@/components/modal";
import { ErrorText, Field } from "@/components/ui";
import { GRANT_META } from "@/lib/portal-access";
import { setPortalAccountType } from "./portal-actions";

const LABEL: Record<PortalAuthority, string> = {
  office_bearer: "Office-bearer",
  committee: "Committee",
  manager: "Manager",
};

/**
 * "Reactivate" and "Change access" on the society page's portal accounts — one
 * dialog, because bringing an account back is also deciding what it comes back
 * as and what it may open (2026-11-19, user-asked).
 */
export function PortalTypeButton({
  profileId,
  societyId,
  label,
  current,
  grants: currentGrants,
  mode,
}: {
  profileId: string;
  societyId: string;
  label: string;
  current: PortalAuthority | null;
  grants: PortalGrant[];
  mode: "reactivate" | "change";
}) {
  const [open, setOpen] = useState(false);
  const [authority, setAuthority] = useState<PortalAuthority>(current ?? "committee");
  const [grants, setGrants] = useState<Set<PortalGrant>>(new Set(currentGrants));
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const reactivate = mode === "reactivate";
  const bearer = authority === "office_bearer";

  function toggle(g: PortalGrant) {
    setGrants((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }

  function save() {
    setError(undefined);
    startTransition(async () => {
      const r = await setPortalAccountType({ id: profileId, societyId, authority, grants: [...grants], reactivate }).catch(
        () => ({ error: "That did not go through — try again." }) as { error?: string },
      );
      if (r.error) setError(r.error);
      else setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setAuthority(current ?? "committee");
          setGrants(new Set(currentGrants));
          setError(undefined);
          setOpen(true);
        }}
        className="text-xs font-semibold text-[var(--accent)] hover:opacity-80"
      >
        {reactivate ? "Reactivate" : "Change access"}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={reactivate ? `Reactivate ${label}` : `${label}'s access`}
        description={reactivate ? "They sign in again with their old password." : undefined}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={save} disabled={pending}>
              {pending ? "Saving…" : reactivate ? "Reactivate" : "Save"}
            </button>
          </>
        }
      >
        <div className="space-y-4 text-left">
          <Field label={reactivate ? "Comes back as" : "Type"} htmlFor={`pt-${profileId}`}>
            <select
              id={`pt-${profileId}`}
              className="field"
              value={authority}
              onChange={(e) => setAuthority(e.target.value as PortalAuthority)}
              disabled={pending}
            >
              {(Object.keys(LABEL) as PortalAuthority[]).map((a) => (
                <option key={a} value={a}>
                  {LABEL[a]}
                </option>
              ))}
            </select>
          </Field>
          {bearer ? (
            <p className="text-sm text-[var(--text-muted)]">
              An office-bearer sees every part of the portal and can make binding decisions for the society.
            </p>
          ) : (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">What they can open</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {GRANT_META.map((g) => (
                  <label key={g.id} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={grants.has(g.id)}
                      onChange={() => toggle(g.id)}
                      disabled={pending}
                    />
                    <span>
                      <span className="font-medium">{g.label}</span>
                      <span className="block text-xs text-[var(--text-muted)]">{g.note}</span>
                    </span>
                  </label>
                ))}
              </div>
              {grants.size === 0 && (
                <p className="mt-2 text-sm" style={{ color: "var(--warn-fg)" }}>
                  With nothing ticked they see only the dashboard.
                </p>
              )}
            </fieldset>
          )}
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      </Modal>
    </>
  );
}
