"use client";

import { useActionState, useState } from "react";
import { loginAction } from "./actions";

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
      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded-[var(--r-md)] p-3"
          style={{ borderColor: "var(--field-border)", background: "var(--surface)", color: "var(--text)" }}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border rounded-[var(--r-md)] p-3"
          style={{ borderColor: "var(--field-border)", background: "var(--surface)", color: "var(--text)" }}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--bad-fg)" }}>
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary w-full p-3 font-semibold disabled:opacity-60">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
