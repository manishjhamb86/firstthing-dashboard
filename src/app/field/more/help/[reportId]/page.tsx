import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card, StatusChip } from "@/components/ui";
import { formatInstant } from "@/lib/format-date";
import { HELP_STATUS_META, helpCategoryLabel } from "@/lib/help-view";
import { signedHelpUrl } from "@/lib/help-files";
import { requireFieldPage } from "../../../access";
import { HelpReplyForm } from "./reply-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Help request" };

export default async function HelpRequestPage({ params }: { params: Promise<{ reportId: string }> }) {
  const me = await requireFieldPage();
  const { reportId } = await params;
  const r = await db.helpReport.findUnique({
    where: { id: reportId },
    include: {
      messages: { orderBy: { createdAt: "asc" }, include: { admin: { select: { name: true, email: true } } } },
      task: { select: { title: true } },
    },
  });
  // Only the person who sent it reads it here (the office reads it in the back office).
  if (!r || r.reporterId !== me.id) notFound();
  const [shot, voice, ...photos] = await Promise.all([signedHelpUrl(r.screenshotKey), signedHelpUrl(r.voiceKey), ...r.photoKeys.map((k) => signedHelpUrl(k))]);
  const meta = HELP_STATUS_META[r.status];

  return (
    <>
      <header className="mb-4">
        <Link href="/field/more/help" className="text-[var(--text-muted)]">
          ← My help requests
        </Link>
        <h1 className="text-[22px] font-bold leading-tight mt-1">{r.title ?? "Help request"}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-[var(--text-muted)]">
          <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
          <span>
            {helpCategoryLabel(r.category)} · sent {formatInstant(r.createdAt)}
          </span>
        </div>
      </header>

      <Card className="p-4 mb-3">
        <p className="text-[13px] text-[var(--text-muted)] mb-1">You wrote</p>
        <p className="whitespace-pre-wrap">{r.description || "(voice note)"}</p>
        {r.transcript && <p className="mt-2 text-[var(--text-muted)] whitespace-pre-wrap">Voice note: “{r.transcript}”</p>}
        {voice && <audio controls src={voice} className="mt-2 w-full" />}
        {r.task && <p className="mt-2 text-[13px] text-[var(--text-muted)]">About: {r.task.title}</p>}
        {(shot || photos.some(Boolean)) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {[shot, ...photos].filter((u): u is string => !!u).map((u, i) => (
              <a key={i} href={u} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- a signed private link */}
                <img src={u} alt={i === 0 && shot ? "Screenshot" : "Photo"} className="h-20 w-20 object-cover rounded-lg border border-[var(--border)]" />
              </a>
            ))}
          </div>
        )}
      </Card>

      {r.status === "new" && r.messages.length === 0 && (
        <Card className="p-4 mb-3">
          <p className="text-[var(--text-muted)]">The office has it. An answer, or who it went to, appears here shortly.</p>
        </Card>
      )}

      {r.messages.map((m) => (
        <Card key={m.id} className={`p-4 mb-3 ${m.author === "reporter" ? "ml-8" : ""}`}>
          <p className="text-[13px] text-[var(--text-muted)] mb-1">
            {m.author === "ai" ? "FirsThing assistant" : m.author === "reporter" ? "You" : (m.admin?.name ?? m.admin?.email ?? "The office")} · {formatInstant(m.createdAt)}
          </p>
          <p className="whitespace-pre-wrap">{m.body}</p>
        </Card>
      ))}

      {r.status === "resolved" && r.resolutionNote && (
        <Card className="p-4 mb-3">
          <p className="text-[13px] text-[var(--text-muted)] mb-1">Resolved</p>
          <p className="whitespace-pre-wrap">{r.resolutionNote}</p>
        </Card>
      )}

      <HelpReplyForm reportId={r.id} answered={r.status === "answered"} />
    </>
  );
}
