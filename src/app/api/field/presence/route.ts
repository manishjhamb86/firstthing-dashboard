import { NextResponse } from "next/server";
import { resolveAdmin } from "@/lib/admin-permissions";
import { reportPendingAs } from "@/lib/survey-core";

/**
 * The phone says how many items it still holds for each survey it has worked
 * on (05-field.md §0.1b "unsynced contributor"). A teammate submitting the
 * survey is then told who still has work on their phone, and how much, as of
 * that phone's last report — the submitter cannot sync someone else's phone.
 */
export async function POST(req: Request) {
  const actor = await resolveAdmin();
  if (!actor) return NextResponse.json({ error: "Your session has ended." }, { status: 401 });
  if (!actor.permissions.includes("manage_survey")) return NextResponse.json({ error: "Not a field account." }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { pending?: unknown } | null;
  const raw = body?.pending && typeof body.pending === "object" ? (body.pending as Record<string, unknown>) : {};
  const pending: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw).slice(0, 50)) if (typeof v === "number") pending[k] = v;
  await reportPendingAs(actor, pending);
  return NextResponse.json({ ok: true });
}
