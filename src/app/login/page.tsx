import { Gauge, BadgeCheck, FileSearch } from "lucide-react";
import { LoginForm } from "./login-form";
import { BrandMark } from "@/components/brand-mark";
import { resolveTheme } from "@/lib/resolve-theme";

// Theme-experiment login (2026-08-17): the split-panel treatment both
// reference templates use — a deep brand panel carrying the product's own
// claim, and the form on the content surface beside it. The panel keeps its
// own token family (--auth-panel*) so it stays deep in Light as well as
// Slate; a brand panel is the brand, not a theme variable.
//
// The three proof rows are the product's actual mechanics (CON-11's
// per-light-type circuits, CON-20's band, INV-02's traceability), not
// marketing filler — this is the screen field staff and ops see every
// morning, and it should say something true.
const PROOF = [
  {
    icon: Gauge,
    title: "One benchmark per light type",
    body: "Basement, staircase, lobby — each metered on its own circuit, never averaged together.",
  },
  {
    icon: BadgeCheck,
    title: "Measured, not promised",
    body: "Savings are commissioned from real pre- and post-installation readings, inside a 60–80% band.",
  },
  {
    icon: FileSearch,
    title: "Every figure traces back",
    body: "A society can follow any rupee on an invoice to the meter readings that produced it.",
  },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; reason?: string }>;
}) {
  const { callbackUrl, reason } = await searchParams;
  const theme = await resolveTheme();
  // The form sits on --surface, which is light in Slate/Light and near-black
  // in Dark — so the wordmark variant follows the theme rather than being
  // hardcoded, the exact bug a screenshot caught once already.
  const formBrandVariant = theme === "dark" ? "dark" : "light";

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-12">
      {/* Brand panel — desktop only; the form carries its own mark below lg */}
      <section
        className="relative hidden lg:flex lg:col-span-5 flex-col justify-between overflow-hidden p-12"
        style={{
          background: `linear-gradient(160deg, var(--auth-panel) 0%, var(--auth-panel-lift) 100%)`,
          color: "var(--auth-panel-text)",
        }}
      >
        {/* one soft accent glow for depth — decoration, so hidden from AT */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full"
          style={{ background: `radial-gradient(circle, var(--auth-glow) 0%, transparent 70%)` }}
        />

        <BrandMark variant="dark" className="relative h-8" />

        <div className="relative max-w-md">
          <h2 className="text-[30px] font-bold leading-[1.2] tracking-[-0.02em] text-balance">
            Savings you can audit, circuit by circuit.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed" style={{ color: "var(--auth-panel-muted)" }}>
            Operations for verified utility savings across Indian residential societies — from the
            first site survey to the monthly bill.
          </p>

          <ul className="mt-10 space-y-6">
            {PROOF.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span
                  aria-hidden
                  className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-md)]"
                  style={{ background: "rgba(255,255,255,0.08)", border: "1px solid var(--auth-panel-line)" }}
                >
                  <Icon size={19} strokeWidth={1.75} />
                </span>
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--auth-panel-muted)" }}>
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[13px]" style={{ color: "var(--auth-panel-muted)" }}>
          firsthing.earth
        </p>
      </section>

      {/* Form side — content surface, follows the theme completely */}
      <section
        className="flex min-h-screen lg:min-h-0 lg:col-span-7 items-center justify-center p-6 sm:p-10"
        style={{ background: "var(--surface)" }}
      >
        <div className="w-full max-w-[400px]">
          <div className="lg:hidden mb-8">
            <BrandMark variant={formBrandVariant} className="h-8" />
          </div>

          <h1 className="text-[26px] font-bold tracking-[-0.02em]">Sign in</h1>
          <p className="mt-1.5 mb-8 text-[var(--text-muted)]">
            Welcome back. Use the account FirsThing issued you.
          </p>

          {/* A session ended out from under them (src/app/api/session-ended) —
              saying so beats a bare login screen they didn't ask for. */}
          {reason === "session-ended" && (
            <div
              role="status"
              className="mb-6 rounded-[var(--r-sm)] border p-3 text-sm"
              style={{
                background: "var(--info-bg)",
                borderColor: "var(--info-line)",
                color: "var(--info-fg)",
              }}
            >
              Your session ended — your account or its permissions changed. Sign in again to continue.
            </div>
          )}

          <LoginForm callbackUrl={callbackUrl ?? "/"} />

          <p className="mt-8 border-t pt-6 text-[13px] text-[var(--text-subtle)]" style={{ borderColor: "var(--border-subtle)" }}>
            There is no self sign-up — every account is provisioned by FirsThing. Locked out? Ask
            your operations lead to reset it.
          </p>
        </div>
      </section>
    </div>
  );
}
