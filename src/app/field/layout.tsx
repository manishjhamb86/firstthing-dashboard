import type { Metadata, Viewport } from "next";
import { loadFieldWork } from "@/lib/field-work";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format-date";
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
  const jobUrls = work.flatMap((r) => r.fieldPages ?? (r.fieldHref ? [r.fieldHref] : []));
  // The Help sheet offers the person's own open tasks, so a blocker can name one.
  const open = await db.scheduledEvent.findMany({
    where: { assigneeId: admin.id, status: "scheduled" },
    orderBy: { startAt: "asc" },
    take: 30,
    select: { id: true, title: true, startAt: true, society: { select: { name: true } } },
  });
  const helpTasks = open.map((e) => ({ id: e.id, title: e.society && !e.title.includes(e.society.name) ? `${e.title} — ${e.society.name}` : e.title, when: formatDate(e.startAt) }));
  return (
    <FieldShell jobUrls={jobUrls} helpTasks={helpTasks}>
      {children}
    </FieldShell>
  );
}
