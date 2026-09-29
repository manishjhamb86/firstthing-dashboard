import type { Metadata, Viewport } from "next";
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
  await requireFieldPage();
  return <FieldShell>{children}</FieldShell>;
}
