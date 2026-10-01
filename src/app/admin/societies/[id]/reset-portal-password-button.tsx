"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { ErrorText, Field } from "@/components/ui";
import { resetPortalPassword } from "./portal-actions";

/** A back-office reset for when the portal's own "shown once" handover
 *  (set at account creation) was missed, lost, or never reached the person —
 *  the same typed-not-generated, shown-back-once shape as that handover, so
 *  there is one convention for a portal password across both screens. */
export function ResetPortalPasswordButton({
  profileId,
  societyId,
  label,
}: {
  profileId: string;
  societyId: string;
  label: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openIt() {
    setPassword("");
    setError(null);
    setDone(null);
    setOpen(true);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const r = await resetPortalPassword(profileId, societyId, password);
      if (r.error) return setError(r.error);
      setDone(password);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openIt}
        className="text-xs font-semibold text-[var(--text-subtle)] hover:text-[var(--accent)]"
      >
        Reset password
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Reset ${label}'s password`}
        description="Typed here, not generated — shown back once, the same as the society's own handover. Ask them to sign in and change it."
        footer={
          done ? (
            <button type="button" className="btn-primary" onClick={() => setOpen(false)}>
              Done
            </button>
          ) : (
            <>
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" disabled={pending || password.length < 8} onClick={submit}>
                {pending ? "Setting…" : "Set new password"}
              </button>
            </>
          )
        }
      >
        {done ? (
          <div
            className="rounded-[var(--r-sm)] border px-4 py-3"
            style={{ background: "var(--ok-bg)", borderColor: "var(--ok-line)", color: "var(--ok-fg)" }}
          >
            <p className="text-sm font-semibold">Password set — pass this on now</p>
            <p className="mt-1 text-[13px] num font-semibold">{done}</p>
            <p className="mt-1 text-xs">This is shown once and cannot be retrieved after you close this.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="New password" htmlFor="reset-pw" hint="At least 8 characters.">
              <input
                id="reset-pw"
                type="text"
                className="field num"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
              />
            </Field>
            {error && <ErrorText>{error}</ErrorText>}
          </div>
        )}
      </Modal>
    </>
  );
}
