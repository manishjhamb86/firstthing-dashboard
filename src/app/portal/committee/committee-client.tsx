"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardTitle, ErrorText, Field, StatusChip } from "@/components/ui";
import { PORTAL_AUTHORITY_LABEL } from "@/lib/status-maps";
import { createSocietyAccount, deactivateSocietyAccount } from "../actions";
import { TransferButton } from "../transfer-button";

type Account = {
  id: string;
  name: string | null;
  email: string;
  authority: string;
  isSelf: boolean;
};

/**
 * The society's own membership list.
 *
 * Society-level only, by construction: every action here resolves the
 * society from the signed-in row (INV-05), the office-bearer designation is
 * moved by transfer rather than issued, and a portal account is a Profile —
 * which can never mint an admin session at all (INV-01, separate table).
 */
export function CommitteeClient({
  accounts,
  viewerIsOfficeBearer,
}: {
  accounts: Account[];
  viewerIsOfficeBearer: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authority, setAuthority] = useState("committee");
  const [error, setError] = useState<string | undefined>();
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [handover, setHandover] = useState<{ email: string; password: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(undefined);
    startTransition(async () => {
      const result = await createSocietyAccount({ name, email, password, authority });
      if (result.error) setError(result.error);
      else {
        // Shown once, here: there is no email provider in this build, so the
        // office-bearer hands the password over themselves.
        setHandover({ email: email.trim().toLowerCase(), password });
        setName("");
        setEmail("");
        setPassword("");
        setAuthority("committee");
        setOpen(false);
        router.refresh();
      }
    });
  }

  function remove(a: Account) {
    setRowError(null);
    if (!window.confirm(`Remove ${a.name ?? a.email} from your society? They lose access immediately.`)) return;
    startTransition(async () => {
      const result = await deactivateSocietyAccount(a.id);
      if (result.error) setRowError({ id: a.id, message: result.error });
      else router.refresh();
    });
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-12">
      <Card className="p-6 lg:col-span-7">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="mb-0">Committee accounts</CardTitle>
          {viewerIsOfficeBearer && !open && (
            <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}>
              Add an account
            </button>
          )}
        </div>
        <p className="mb-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
          These are the people at your society who can sign in. Exactly one holds the office-bearer
          designation — the only authority that can accept an offer or sign an agreement.
        </p>

        {handover && (
          <div
            className="mb-4 rounded-[var(--r-sm)] border px-4 py-3"
            style={{ background: "var(--ok-bg)", borderColor: "var(--ok-line)", color: "var(--ok-fg)" }}
          >
            <p className="text-sm font-semibold">Account created — pass these on now</p>
            <p className="mt-1 text-[13px]">
              <span className="num">{handover.email}</span> · temporary password{" "}
              <span className="num font-semibold">{handover.password}</span>
            </p>
            <p className="mt-1 text-xs">
              This is shown once. Ask them to sign in and change it.
            </p>
          </div>
        )}

        {open && (
          <form
            className="mb-5 space-y-4 rounded-[var(--r-sm)] border p-4"
            style={{ borderColor: "var(--border)", background: "var(--surface-sunken)" }}
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <Field label="Name" htmlFor="ca-name">
              <input id="ca-name" className="field" value={name} onChange={(e) => setName(e.target.value)} disabled={pending} />
            </Field>
            <Field label="Email" htmlFor="ca-email">
              <input id="ca-email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending} autoComplete="off" />
            </Field>
            <Field
              label="Authority"
              htmlFor="ca-authority"
              hint="The office-bearer designation is not issued here — it is transferred, and there is only ever one."
            >
              <select id="ca-authority" className="field" value={authority} onChange={(e) => setAuthority(e.target.value)} disabled={pending}>
                <option value="committee">Committee — reviews the day&apos;s work</option>
                <option value="manager">Manager — reviews the day&apos;s work on site</option>
              </select>
            </Field>
            <Field
              label="Temporary password"
              htmlFor="ca-password"
              hint="At least 8 characters. You will see it once, to hand over."
            >
              <input id="ca-password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} disabled={pending} autoComplete="new-password" />
            </Field>
            {error && <ErrorText>{error}</ErrorText>}
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" className="btn-primary" disabled={pending}>
                {pending ? "Adding…" : "Add account"}
              </button>
              <button type="button" className="btn-ghost" disabled={pending} onClick={() => { setOpen(false); setError(undefined); }}>
                Cancel
              </button>
            </div>
          </form>
        )}

        <ul className="space-y-3">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="border-t pt-3 first:border-t-0 first:pt-0"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <span className="text-sm font-semibold">
                    {a.name ?? a.email}
                    {a.isSelf && (
                      <span className="ml-1.5 text-xs font-semibold" style={{ color: "var(--text-subtle)" }}>
                        (you)
                      </span>
                    )}
                  </span>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {a.email}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip tone={a.authority === "office_bearer" ? "ok" : "info"}>
                    {PORTAL_AUTHORITY_LABEL[a.authority] ?? a.authority}
                  </StatusChip>
                  {viewerIsOfficeBearer && a.authority !== "office_bearer" && (
                    <>
                      <TransferButton profileId={a.id} />
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        disabled={pending}
                        onClick={() => remove(a)}
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>
              {rowError?.id === a.id && (
                <div className="mt-2">
                  <ErrorText>{rowError.message}</ErrorText>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-6 lg:col-span-5">
        <CardTitle>What you can and cannot do here</CardTitle>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          These accounts see only your society&apos;s data, and nothing else in FirsThing. The
          office-bearer designation moves by handing it to someone — there is always exactly one, so
          it is transferred rather than added, and the account holding it cannot be removed until it
          has been passed on.
        </p>
      </Card>
    </div>
  );
}
