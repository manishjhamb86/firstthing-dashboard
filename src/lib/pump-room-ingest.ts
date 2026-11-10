/**
 * Orchestrates the EMS pump-room email pipeline: poll the dedicated
 * mailbox, dedupe durably by Gmail message id, store raw bytes before
 * interpretation (CON-30), match a subject label to a classified
 * EmsPumpMeter, and derive one daily kWh figure by differencing the
 * cumulative register against the previous day's own closing sample.
 *
 * Shared by the recurring job (scripts/job-worker.ts) and the admin
 * actions (a manual "sweep now" trigger, and the classify-from-queue
 * backfill) — one orchestration, several callers.
 */

import { createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { s3, S3_BUCKET } from "@/lib/s3";
import { logger } from "@/lib/logger";
import { getAttachment, getMessage, listMessages, resolveGmailConfig } from "@/lib/google-gmail";
import { buildPumpRoomIngestKey } from "@/lib/ingest-keys";
import { readPumpRoomWorkbook } from "@/lib/pump-room-xlsx";
import { utcDayOf } from "@/lib/reading-normalize";

// The subject line is the real filter, not the sender (2026-11-10,
// user-asked "how do I test this"): a genuine mail-forwarding RULE usually
// preserves the original From header, but that is not guaranteed across
// every forwarding mechanism, and a manually-forwarded test copy (clicking
// Forward in Gmail) never does — it carries the forwarder's own address and
// a "Fwd:" subject prefix instead. A hard `from:` filter would then risk
// silently matching nothing, forever, which is the worst failure shape —
// no error, just an empty inbox read as "nothing has arrived yet". The
// dedicated mailbox exists for exactly one purpose, so the subject pattern
// alone is a safe enough filter, and it is tolerant of a forward/reply
// prefix for the same reason.
const SUBJECT_PATTERN = /^(?:(?:fwd?|re)\s*:\s*)*EMS-Automated daily Report\s*:\s*(.+)$/i;

/**
 * The exact label after the colon, with any forward/reply prefix and the
 * vendor's own boilerplate stripped — the thing an operator actually
 * classifies against. Falls back to the whole (trimmed) subject when it
 * doesn't match the pattern at all, so a mis-shaped subject still lands
 * somewhere an operator can see and classify by hand, rather than being
 * silently dropped.
 */
export function subjectLabelOf(subject: string): string {
  const match = subject.match(SUBJECT_PATTERN);
  return (match ? match[1] : subject).trim();
}

export type DailyFigure = { dailyKwh: number | null; registerWentBackwards: boolean };

/**
 * The one piece of arithmetic that decides a day's consumption — factored
 * out as a pure function (this codebase's standing "the decision is pure,
 * the action is a thin DB shell" convention) so it is unit-testable without
 * a database.
 *
 * No prior day is correct, not a loss — the consumption before the first
 * reading genuinely is not in this account's history
 * (reading-normalize.ts's own stated reasoning for a cumulative register's
 * first point). A backwards register is stored but never treated as
 * consumption, at day-closing granularity instead of
 * reading-normalize.ts's per-interval one.
 */
export function deriveDailyFigure(closingKwh: number, priorKwh: number | null): DailyFigure {
  if (priorKwh === null) return { dailyKwh: null, registerWentBackwards: false };
  const delta = closingKwh - priorKwh;
  if (delta < 0) return { dailyKwh: null, registerWentBackwards: true };
  return { dailyKwh: delta, registerWentBackwards: false };
}

export type SweepResult = { checked: number; applied: number; needsAssignment: number; failed: number };

export async function sweepPumpRoomEmails(): Promise<SweepResult> {
  const cfg = await resolveGmailConfig();
  if (!cfg) {
    // Not configured yet is a normal state, not a failure — the chain keeps
    // ticking so ingestion starts the moment operations saves credentials.
    logger.info("job.pump_room_email_sweep_skipped", { reason: "no_config" });
    return { checked: 0, applied: 0, needsAssignment: 0, failed: 0 };
  }

  const messages = await listMessages(cfg, `subject:"EMS-Automated daily Report"`, 25);
  let checked = 0;
  let applied = 0;
  let needsAssignment = 0;
  let failed = 0;

  for (const m of messages) {
    // The one durable dedupe check, before any heavy work — a DB column,
    // not an in-memory "seen this session" set, so it survives a worker
    // restart.
    const already = await db.emsPumpEmailIngest.findUnique({ where: { gmailMessageId: m.id }, select: { id: true } });
    if (already) continue;
    checked++;

    try {
      const msg = await getMessage(cfg, m.id);
      const subjectLabel = subjectLabelOf(msg.subject);
      const attachment = msg.attachments.find((a) => /\.xlsx?$/i.test(a.filename)) ?? msg.attachments[0];
      if (!attachment) {
        logger.warn("job.pump_room_email_sweep_no_attachment", { gmailMessageId: m.id, subject: msg.subject });
        failed++;
        continue;
      }

      const bytes = await getAttachment(cfg, m.id, attachment.attachmentId);
      const fileHash = createHash("sha256").update(bytes).digest("hex");
      const s3Key = buildPumpRoomIngestKey({ subjectLabel, gmailMessageId: m.id, receivedAt: msg.receivedAt });
      // Raw bytes land in S3 before anything interprets them (CON-30) —
      // durable even if the parse below fails.
      await s3.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: s3Key,
          Body: bytes,
          ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );

      // Exact match on the hand-classified label — deliberately not a fuzzy
      // match. The same string arrives daily for the life of this room; a
      // one-time classification solves the matching problem permanently,
      // where a fuzzy match would carry a small, compounding mismatch risk
      // every single day.
      const meter = await db.emsPumpMeter.findUnique({ where: { vendorSubjectLabel: subjectLabel }, select: { id: true } });

      const ingest = await db.emsPumpEmailIngest.create({
        data: {
          gmailMessageId: m.id,
          gmailThreadId: msg.threadId,
          subjectLabel,
          receivedAt: msg.receivedAt,
          pumpMeterId: meter?.id ?? null,
          s3Key,
          fileHash,
          byteSize: bytes.length,
          status: "needs_assignment",
        },
      });

      if (meter) {
        try {
          await applyIngestToMeter(ingest.id, meter.id);
          applied++;
        } catch (err) {
          logger.warn("job.pump_room_email_sweep_apply_failed", { ingestId: ingest.id, error: String(err) });
          failed++;
        }
      } else {
        needsAssignment++;
      }
    } catch (err) {
      logger.warn("job.pump_room_email_sweep_message_failed", { gmailMessageId: m.id, error: String(err) });
      failed++;
    }
  }

  return { checked, applied, needsAssignment, failed };
}

/**
 * Parses one ingest's stored bytes and derives its day's closing figure.
 * Independently callable — used inline during a live sweep, and again by
 * the classify-from-queue backfill once an operator finally names which
 * pump room a backlog of unassigned emails belongs to.
 *
 * Day-closing differencing, not per-interval: the ask is only ever
 * "kWh/day," and the vendor sends one email per day. Diffing every
 * intraday sample would risk double-counting across overlapping or resent
 * emails with no clean idempotency story. Taking only each day's LAST
 * sample and diffing it against the PREVIOUS day's own last sample is
 * trivially idempotent — recomputing a day depends only on two fixed rows
 * of record — and is exactly what the feature asks for. The raw bytes stay
 * in S3 regardless, so a finer-grained re-derivation later is never
 * precluded.
 *
 * Backfill ordering: when called as part of a multi-day backfill, the
 * caller MUST process ingests in `receivedAt` ascending order — this
 * function only ever looks BACKWARD for a prior day, so applying days out
 * of order would wrongly leave the earlier one looking like it has no
 * predecessor.
 */
export async function applyIngestToMeter(ingestId: string, meterId: string): Promise<void> {
  const ingest = await db.emsPumpEmailIngest.findUnique({ where: { id: ingestId } });
  if (!ingest) throw new Error("That ingest no longer exists.");

  let bytes: Uint8Array;
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: ingest.s3Key }));
    bytes = await obj.Body!.transformToByteArray();
  } catch {
    await db.emsPumpEmailIngest.update({
      where: { id: ingestId },
      data: { status: "parse_failed", parseError: "The file could not be read back from storage.", pumpMeterId: meterId },
    });
    return;
  }

  const parsed = readPumpRoomWorkbook(bytes);
  if (parsed.rows.length === 0) {
    await db.emsPumpEmailIngest.update({
      where: { id: ingestId },
      data: {
        status: "parse_failed",
        parseError: parsed.problems.join(" ") || "No usable rows were found in this file.",
        pumpMeterId: meterId,
      },
    });
    return;
  }

  const closing = parsed.rows[parsed.rows.length - 1]; // latest ts in the file
  const day = utcDayOf(closing.ts);

  const [prior, existingDay] = await Promise.all([
    db.emsPumpReading.findFirst({
      where: { pumpMeterId: meterId, date: { lt: day } },
      orderBy: { date: "desc" },
      select: { lastKwh: true },
    }),
    db.emsPumpReading.findUnique({ where: { pumpMeterId_date: { pumpMeterId: meterId, date: day } }, select: { lastTs: true } }),
  ]);

  // A resend whose closing sample is no later than what's already stored
  // for this day is a harmless no-op.
  if (existingDay && existingDay.lastTs.getTime() >= closing.ts.getTime()) {
    logger.info("pump_room.ingest_duplicate_day", { ingestId, meterId, day: day.toISOString() });
    await db.emsPumpEmailIngest.update({
      where: { id: ingestId },
      data: { status: "applied", appliedAt: new Date(), pumpMeterId: meterId, rowCount: parsed.rows.length },
    });
    return;
  }

  const { dailyKwh, registerWentBackwards } = deriveDailyFigure(closing.kwh, prior?.lastKwh ?? null);

  await db.$transaction([
    db.emsPumpReading.upsert({
      where: { pumpMeterId_date: { pumpMeterId: meterId, date: day } },
      create: {
        pumpMeterId: meterId,
        date: day,
        lastKwh: closing.kwh,
        lastTotalFlow: closing.totalFlow,
        lastTs: closing.ts,
        dailyKwh,
        registerWentBackwards,
        sourceIngestId: ingestId,
      },
      update: {
        lastKwh: closing.kwh,
        lastTotalFlow: closing.totalFlow,
        lastTs: closing.ts,
        dailyKwh,
        registerWentBackwards,
        sourceIngestId: ingestId,
      },
    }),
    db.emsPumpMeter.update({
      where: { id: meterId },
      data: { lastKwh: closing.kwh, lastTotalFlow: closing.totalFlow, lastReadingAt: closing.ts, lastIngestAt: new Date() },
    }),
    db.emsPumpEmailIngest.update({
      where: { id: ingestId },
      data: { status: "applied", appliedAt: new Date(), pumpMeterId: meterId, rowCount: parsed.rows.length },
    }),
  ]);
}
