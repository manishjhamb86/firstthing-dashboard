"use client";

import { useState, useTransition } from "react";
import type { PortalAuthority } from "@prisma/client";
import { Modal } from "@/components/modal";
import { ErrorText, Field } from "@/components/ui";
import { setPortalAccountType } from "./portal-actions";

const LABEL: Record<PortalAuthority, string> = {
  office_bearer: "Office-bearer",
  committee: "Committee",
  manager: "Manager",
};

/**
 * "Reactivate" and "Change type" on the society page's portal accounts — one
 * dialog, because bringing an account back is also deciding what it comes back
 * as (2026-11-19, user-asked).
 */
export function PortalTypeButton({
  profileId,
  societyId,
  label,
  current,
  officeBearer,
  mode,
}: {
  profileId: string;
  societyId: string;
  label: string;
  current: PortalAuthority | null;
  /** Name of the account holding the office-bearer designation now, if another. */
  officeBearer: string | null;
  mode: "reactivate" | "change";
}) {
  const [open, setOpen] = useState(false);
  const [authority, setAuthority] = useState<PortalAuthority>(current ?? "committee");
  const [error, setError] = useState<string | undefined>();
  const [note, setNote] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const reactivate = mode === "reactivate";

  function save() {
    setError(undefined);
    startTransition(async () => {
      const r = await setPortalAccountType({ id: profileId, societyId, authority, reactivate }).catch(
        () => ({ error: "That did not go through — try again." }) as { error?: string; note?: string },
      );
      if (r.error) setError(r.error);
      else {
        setNote(r.note);
        setOpen(false);
      }
    });
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={() => {
          setAuthority(current ?? "committee");
          setError(undefined);
          setNote(undefined);
          setOpen(true);
        }}
        className="text-xs font-semibold text-[var(--accent)] hover:opacity-80"
      >
        {reactivate ? "Reactivate" : "Change type"}
      </button>
      {note && <p className="text-xs text-[var(--text-muted)]">{note}</p>}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={reactivate ? `Reactivate ${label}` : `Change ${label}'s type`}
        description={reactivate ? "They sign in again with their old password and the modules they had." : undefined}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={save}
              disabled={pending || (!reactivate && authority === current)}
            >
              {pending ? "Saving…" : reactivate ? "Reactivate" : "Save"}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-left">
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
          {authority === "office_bearer" && officeBearer && (
            <p className="text-sm text-[var(--text-muted)]">
              A society has one office-bearer. {officeBearer} holds it now and becomes committee.
            </p>
          )}
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      </Modal>
    </div>
  );
}
