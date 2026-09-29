import type { Metadata, Viewport } from "next";
import { loadFieldWork } from "@/lib/field-work";
import { requireFieldPage } from "./access";
import { FieldShell } from "./field-shell";

// The field app (docs/engineering/19-field-app.md): an installable web app for
// the field team, inside the same Next app as the back office. Its own shell —
// no sidebar, one-handed, bottom navigation — because the field surface is
// visit-scoped, not module-scoped (05-field.md §0.4).
//
// The manifest is linked from THIS layout only, so installing from any other
// page does not make the back office an app called "FirsThing Field".
export const metadata: Metadata = {
  title: { default: "FirsThing Field", template: "%s · FirsThing Field" },
  manifest: "/field.webmanifest",
  appleWebApp: { capable: true, title: "FT Field", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#1C2434",
  width: "device-width",
  initialScale: 1,
};

export default async function FieldLayout({ children }: { children: React.ReactNode }) {
  // Every page below checks again; a layout is not an auth boundary.
  const admin = await requireFieldPage();
  // The person's own on-site jobs are kept on the phone too, so the demo they
  // are walking to opens in a basement even if it was never opened before.
  const work = await loadFieldWork(admin.id, true);
  const jobUrls = work.flatMap((r) => (r.fieldHref ? [r.fieldHref] : []));
  return <FieldShell jobUrls={jobUrls}>{children}</FieldShell>;
}
