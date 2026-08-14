"use client";

import { useActionState, useState } from "react";
import { loginAction } from "./actions";
import { ErrorText, Field } from "@/components/ui";

// Controlled inputs, deliberately — React 19 resets a form's *uncontrolled*
// fields after every submission, success or failure (confirmed by direct
// testing: an <input required> with no defaultValue goes empty after a
// failed submit, and the next click is then silently blocked by the
// browser's own native required-field validation before it ever reaches
// this action — no error, no loading state, nothing, which reads exactly
// like "the button is broken"). Keeping email/password as controlled state
// means a wrong password doesn't also wipe the email the user already typed.
export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [error, formAction, pending] = useActionState(loginAction, undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <Field label="Email" htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field"
        />
      </Field>
      <Field label="Password" htmlFor="password">
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field"
        />
      </Field>
      {error && <ErrorText>{error}</ErrorText>}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
