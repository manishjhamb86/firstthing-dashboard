import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { Card, CardTitle, PageHeader, StatusChip } from "@/components/ui";
import { formatDate, formatInstant } from "@/lib/format-date";
import { HELP_STATUS_META, helpCategoryLabel } from "@/lib/help-view";
import { signedHelpUrl } from "@/lib/help-files";
import { HelpDeskControls } from "./controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Help request" };

export default async function HelpReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  await requireAdminPage();
  const admin = (await resolveAdmin())!;
  const { reportId } = await params;
  const r = await db.helpReport.findUnique({
    where: { id: reportId },
    include: {
      reporter: { select: { name: true, email: true, team: true } },
      resolvedBy: { select: { name: true, email: true } },
      task: { select: { id: true, title: true, startAt: true, createdBy: { select: { name: true, email: true } }, society: { select: { name: true } } } },
      messages: { orderBy: { createdAt: "asc" }, include: { admin: { select: { name: true, email: true } } } },
    },
  });
  if (!r) notFound();
  const [shot, voice, ...photos] = await Promise.all([signedHelpUrl(r.screenshotKey), signedHelpUrl(r.voiceKey), ...r.photoKeys.map((k) => signedHelpUrl(k))]);
  const sentTo = r.routedToIds.length
    ? (await db.adminUser.findMany({ where: { id: { in: r.routedToIds } }, select: { name: true, email: true } })).map((a) => a.name ?? a.email)
    : [];
  const mayAct = admin.team === "operations" || admin.receivesBugReports || r.routedToIds.includes(admin.id);
  const meta = HELP_STATUS_META[r.status];
  const info = (r.clientInfo ?? {}) as { errors?: string[]; screen?: string; online?: boolean; waitingToSend?: number; userAgent?: string };

  return (
    <>
      <PageHeader
        backHref="/admin/help"
        title={r.title ?? "Help request"}
        chip={<StatusChip tone={meta.tone}>{meta.label}</StatusChip>}
        subtitle={`${helpCategoryLabel(r.category)} · from ${r.reporter.name ?? r.reporter.email} · ${formatInstant(r.createdAt)}`}
      />
      <div className="grid gap-5 lg:grid-cols-12 items-start">
        <div className="lg:col-span-7 min-w-0 space-y-5">
          <Card className="p-6">
            <CardTitle>What they reported</CardTitle>
            <p className="whitespace-pre-wrap">{r.description || "(no text — see the voice note)"}</p>
            {r.transcript && <p className="mt-3 whitespace-pre-wrap text-[var(--text-muted)]">Voice note, transcribed: “{r.transcript}”</p>}
            {voice && <audio controls src={voice} className="mt-3 w-full" />}
            {shot && (
              <div className="mt-4">
                <p className="lbl mb-1">Their screen when they tapped Help</p>
                <a href={shot} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a signed private link */}
                  <img src={shot} alt="Screenshot of the field app screen" className="max-h-[420px] rounded-lg border border-[var(--border)]" />
                </a>
              </div>
            )}
            {photos.some(Boolean) && (
              <div className="mt-4">
                <p className="lbl mb-1">Photos from the site</p>
                <div className="flex flex-wrap gap-2">
                  {photos.filter((u): u is string => !!u).map((u, i) => (
                    <a key={i} href={u} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a signed private link */}
                      <img src={u} alt={`Photo ${i + 1}`} className="h-32 w-32 object-cover rounded-lg border border-[var(--border)]" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="p-6">
            <CardTitle>Conversation</CardTitle>
            {r.messages.length === 0 ? (
              <p className="text-[var(--text-muted)]">{r.aiState === "done" ? "No replies yet." : "The AI has not read it yet."}</p>
            ) : (
              <div className="space-y-3">
                {r.messages.map((m) => (
                  <div key={m.id} className="rounded-[var(--r-md)] border border-[var(--border-subtle)] p-3">
                    <p className="text-[12px] text-[var(--text-muted)] mb-1">
                      {m.author === "ai" ? "AI assistant" : m.author === "reporter" ? `${r.reporter.name ?? r.reporter.email} (reporter)` : (m.admin?.name ?? m.admin?.email ?? "Staff")} ·{" "}
                      {formatInstant(m.createdAt)}
                    </p>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </div>
                ))}
              </div>
            )}
            {r.status === "resolved" && (
              <p className="mt-4 text-[13px]">
                Resolved by {r.resolvedBy?.name ?? r.resolvedBy?.email ?? "—"}
                {r.resolvedAt ? ` on ${formatInstant(r.resolvedAt)}` : ""}: {r.resolutionNote}
              </p>
            )}
            {mayAct ? (
              <HelpDeskControls reportId={r.id} status={r.status} category={r.category} />
            ) : (
              <p className="mt-4 text-[13px] text-[var(--text-muted)]">Operations, the bug receivers, or someone it was sent to can reply and act on it.</p>
            )}
          </Card>
        </div>

        <div className="lg:col-span-5 min-w-0 space-y-5">
          <Card className="p-6">
            <CardTitle>Details</CardTitle>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-[var(--text-muted)]">From</dt>
              <dd>
                {r.reporter.name ?? r.reporter.email} · {r.reporter.team}
              </dd>
              <dt className="text-[var(--text-muted)]">Screen</dt>
              <dd className="break-all">
                {r.page}
                {r.pageTitle ? ` — ${r.pageTitle}` : ""}
              </dd>
              {r.task && (
                <>
                  <dt className="text-[var(--text-muted)]">Task</dt>
                  <dd>
                    <Link href="/admin/tasks" className="hover:underline">
                      {r.task.title}
                    </Link>
                    {r.task.society ? ` · ${r.task.society.name}` : ""} · {formatDate(r.task.startAt)} · set by {r.task.createdBy.name ?? r.task.createdBy.email}
                  </dd>
                </>
              )}
              <dt className="text-[var(--text-muted)]">Sent to</dt>
              <dd>{sentTo.length ? sentTo.join(", ") : "Nobody yet"}</dd>
              <dt className="text-[var(--text-muted)]">AI</dt>
              <dd>
                {r.aiState === "done"
                  ? `Read ${r.aiReadAt ? formatInstant(r.aiReadAt) : ""}`
                  : `Not read yet${r.aiError ? ` — ${r.aiError}` : ""} (${r.aiAttempts} ${r.aiAttempts === 1 ? "try" : "tries"})`}
              </dd>
              {info.screen && (
                <>
                  <dt className="text-[var(--text-muted)]">Phone</dt>
                  <dd>
                    {info.screen}
                    {info.online === false ? " · no signal when sent" : ""}
                    {info.waitingToSend ? ` · ${info.waitingToSend} items waiting to send` : ""}
                  </dd>
                </>
              )}
            </dl>
            {info.errors && info.errors.length > 0 && (
              <div className="mt-4">
                <p className="lbl mb-1">Errors on the page before the report</p>
                <pre className="num text-[12px] whitespace-pre-wrap rounded-[var(--r-md)] p-3" style={{ background: "var(--surface-sunken)" }}>
                  {info.errors.join("\n")}
                </pre>
              </div>
            )}
            {info.userAgent && <p className="mt-3 text-[11px] break-all" style={{ color: "var(--text-subtle)" }}>{info.userAgent}</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
