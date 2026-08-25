import { BrandMark } from "@/components/brand-mark";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import type { ThemeId } from "@/lib/theme";

/**
 * The portal's chrome and its content width, in one place.
 *
 * Every portal page repeated this header and capped itself at max-w-3xl —
 * 768px, which on a desktop monitor reads as a phone page stretched down the
 * middle of the screen (user-reported 2026-08-25: "it gives a feeling of a
 * mobile page on desktop"). The container is fluid now: full width on a
 * phone, and up to 1200px on a desktop, with each page laying its own cards
 * into columns at `lg`. 1200 rather than "all of it" because prose still has
 * to be readable — a 1900px paragraph is its own kind of wrong.
 */
export function PortalShell({
  theme,
  children,
}: {
  theme: ThemeId;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <div
        className="sticky top-0 z-20"
        style={{ background: "var(--chrome)", borderBottom: "1px solid var(--chrome-border)" }}
      >
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-3 sm:px-8">
          <BrandMark variant={theme === "light" ? "light" : "dark"} className="h-7" />
          <div className="flex items-center gap-4">
            <ThemeSwitcher current={theme} />
            <SignOutButton
              className="text-sm font-medium hover:opacity-80"
              style={{ color: "var(--chrome-muted)" }}
            />
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-[1200px] p-5 sm:p-8">{children}</div>
    </div>
  );
}
