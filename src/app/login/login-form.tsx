"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { loginAction } from "./actions";
import { Field } from "@/components/ui";

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
  const [reveal, setReveal] = useState(false);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      <Field label="Email" htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@firsthing.earth"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field"
        />
      </Field>

      <Field label="Password" htmlFor="password">
        <div className="relative">
          <input
            id="password"
            name="password"
            type={reveal ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field pr-11"
          />
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? "Hide password" : "Show password"}
            aria-pressed={reveal}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-[var(--r-sm)]"
            style={{ color: "var(--text-subtle)" }}
          >
            {reveal ? <EyeOff size={17} strokeWidth={1.75} /> : <Eye size={17} strokeWidth={1.75} />}
          </button>
        </div>
      </Field>

      {/* A wrong password is the most-seen state on this screen — it gets a
          real banner rather than a line of red text under the fields. */}
      {error && (
        <p
          role="alert"
          className="rounded-[var(--r-sm)] border p-3 text-sm"
          style={{ background: "var(--bad-bg)", borderColor: "var(--bad-line)", color: "var(--bad-fg)" }}
        >
          {error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
