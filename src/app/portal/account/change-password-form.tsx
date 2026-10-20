"use client";

import { useState, useTransition } from "react";
import { Field, ErrorText } from "@/components/ui";
import { changeMyPassword } from "../actions";

/**
 * Controlled throughout, per this repo's standing React-19 rule: an
 * uncontrolled field is silently wiped on every submit, success or failure,
 * which reads as "the button is broken" on a retry after a typo.
 */
export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(undefined);
    setDone(false);
    startTransition(async () => {
      const r = await changeMyPassword({ currentPassword: current, newPassword: next, confirmPassword: confirm });
      if (r.error) {
        setError(r.error);
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    });
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="Current password" htmlFor="pw-current">
        <input
          id="pw-current"
          type="password"
          autoComplete="current-password"
          className="field"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
      </Field>
      <Field label="New password" htmlFor="pw-new" hint="At least 8 characters.">
        <input
          id="pw-new"
          type="password"
          autoComplete="new-password"
          className="field"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
        />
      </Field>
      <Field label="Confirm new password" htmlFor="pw-confirm">
        <input
          id="pw-confirm"
          type="password"
          autoComplete="new-password"
          className="field"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </Field>
      {error && <ErrorText>{error}</ErrorText>}
      {done && (
        <p className="text-[13px]" style={{ color: "var(--ok-fg)" }}>
          Password changed.
        </p>
      )}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
