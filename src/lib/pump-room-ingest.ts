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
import type { Prisma } from "@prisma/client";
import { spreadGap } from "@/lib/pump-gap";
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

export type DailyFigure = { daily: number | null; wentBackwards: boolean; basedOnSameDayOpening: boolean };

/**
 * The one piece of arithmetic that decides a day's figure — factored out as
 * a pure function (this codebase's standing "the decision is pure, the
 * action is a thin DB shell" convention) so it is unit-testable without a
 * database. Shared between electricity (kwh) and water (kl) — both are
 * cumulative registers read the same way, differenced the same way.
 *
 * With a previous day on record, diffs against ITS closing sample — the
 * precise figure, since it also captures whatever happened overnight
 * between readings. With no previous day (the meter's first-ever reading,
 * most commonly), falls back to this day's OWN opening sample instead of
 * withholding a figure entirely (2026-11-10, user-asked: "it should at
 * least show the total consumption from that sheet, end minus start") —
 * necessarily an approximation (it misses whatever happened before the
 * file's own first row), which is why `basedOnSameDayOpening` is returned
 * alongside the figure rather than silently blended into the same kind of
 * number as a true day-over-day one.
 *
 * A backwards register is stored but never treated as consumption, at
 * day-closing granularity instead of reading-normalize.ts's per-interval
 * one — same rule, same reasoning, either basis.
 */
export function deriveDailyFigure(closing: number, opening: number, priorClosing: number | null): DailyFigure {
  const basedOnSameDayOpening = priorClosing === null;
  const base = priorClosing ?? opening;
  const delta = closing - base;
  if (delta < 0) return { daily: null, wentBackwards: true, basedOnSameDayOpening };
  return { daily: delta, wentBackwards: false, basedOnSameDayOpening };
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

  // Either the vendor's own email, or one carrying its emails forwarded as
  // attachments (their file names keep the subject).
  const messages = await listMessages(cfg, `{subject:"EMS-Automated daily Report" filename:"EMS-Automated daily Report"}`, 25);
  let checked = 0;
  let needsAssignment = 0;
  let failed = 0;
  // Storing is order-independent (each email's bytes are just filed to
  // S3 and a row created) — applying is NOT (day-closing differencing only
  // ever looks backward). Gmail's own list order is not guaranteed to be
  // chronological, and when several of a meter's emails arrive in one
  // sweep pass (2026-11-10, found by testing: 6 forwarded at once), naively
  // applying each the moment it's stored would compute every one of them
  // against "no prior day" — silently wrong for every day but whichever
  // happens to be processed first. So this pass only STORES; applying
  // happens afterward, once per touched meter, in the one place that
  // enforces the real order (applyPendingIngestsForMeter).
  const touchedMeterIds = new Set<string>();

  for (const m of messages) {
    // The one durable dedupe check, before any heavy work — a DB column,
    // not an in-memory "seen this session" set, so it survives a worker
    // restart. A message carrying several reports files each under
    // `{messageId}:{n}`, so its first report's id is what marks it seen.
    const already = await db.emsPumpEmailIngest.findFirst({
      where: { OR: [{ gmailMessageId: m.id }, { gmailMessageId: { startsWith: `${m.id}:` } }] },
      select: { id: true },
    });
    if (already) continue;
    checked++;

    try {
      const msg = await getMessage(cfg, m.id);
      // Every spreadsheet in the message is a report of its own: an email
      // forwarding a batch of earlier reports as attached .eml files
      // (2026-11-19, 50 at once) carries one per forwarded email.
      const sheets = msg.attachments.filter((a) => /\.xlsx?$/i.test(a.filename));
      const reports = sheets.length > 0 ? sheets : msg.attachments.slice(0, 1);
      if (reports.length === 0) {
        logger.warn("job.pump_room_email_sweep_no_attachment", { gmailMessageId: m.id, subject: msg.subject });
        failed++;
        continue;
      }

      for (let i = 0; i < reports.length; i++) {
        const attachment = reports[i];
        const ingestId = reports.length === 1 ? m.id : `${m.id}:${String(i + 1).padStart(3, "0")}`;
        try {
          // The label comes from the forwarded email a spreadsheet sits in
          // when it sits in one ("EMS-Automated daily Report : RG Residency.eml"),
          // else from this message's own subject.
          const subjectLabel = subjectLabelOf(attachment.enclosedIn ? attachment.enclosedIn.replace(/\.eml$/i, "") : msg.subject);
          const bytes = await getAttachment(cfg, m.id, attachment.attachmentId);
          const fileHash = createHash("sha256").update(bytes).digest("hex");

          // The same file forwarded again (a batch resending reports already
          // received one by one) is recorded once.
          const sameFile = await db.emsPumpEmailIngest.findFirst({ where: { fileHash }, select: { id: true } });
          if (sameFile) {
            logger.info("job.pump_room_email_sweep_same_file", { gmailMessageId: ingestId, filename: attachment.filename, existingIngestId: sameFile.id });
            continue;
          }

          const s3Key = buildPumpRoomIngestKey({ subjectLabel, gmailMessageId: ingestId, receivedAt: msg.receivedAt });
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

          await db.emsPumpEmailIngest.create({
            data: {
              gmailMessageId: ingestId,
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

          if (meter) touchedMeterIds.add(meter.id);
          else needsAssignment++;
        } catch (err) {
          logger.warn("job.pump_room_email_sweep_report_failed", { gmailMessageId: ingestId, filename: attachment.filename, error: String(err) });
          failed++;
        }
      }
    } catch (err) {
      logger.warn("job.pump_room_email_sweep_message_failed", { gmailMessageId: m.id, error: String(err) });
      failed++;
    }
  }

  let applied = 0;
  for (const meterId of touchedMeterIds) {
    const r = await applyPendingIngestsForMeter(meterId);
    applied += r.applied;
    failed += r.failed;
  }

  return { checked, applied, needsAssignment, failed };
}

/**
 * Applies every `needs_assignment` ingest a meter is holding, in order of
 * the CALENDAR DAY each file's own data covers — the one place that
 * enforces the order applyIngestToMeter's own backward-looking
 * differencing depends on. Shared by the live sweep (above) and
 * classify-from-queue's backfill (src/app/admin/pump-rooms/actions.ts), so
 * there is exactly one piece of code that gets this ordering right rather
 * than two that have to agree.
 *
 * Deliberately NOT sorted by `receivedAt` (when Gmail says the email
 * arrived) — found wrong by testing (2026-11-10): a backfill forwards
 * historical days out of their original order on purpose (the very first
 * test email, forwarded hours before a 6-day batch, carried the LATEST
 * calendar day of the whole set but the EARLIEST receivedAt). receivedAt
 * only happens to match data order for a same-day automated feed; a
 * backfill is exactly the case where it doesn't. So every pending file is
 * read and parsed once here — more work than trusting a DB column, but the
 * only way to be right regardless of how or when the emails arrived. An
 * unreadable file sorts last and is still applied, so it surfaces its own
 * parse_failed status rather than being silently skipped.
 */
export async function applyPendingIngestsForMeter(meterId: string): Promise<{ applied: number; failed: number }> {
  const pending = await db.emsPumpEmailIngest.findMany({
    where: { pumpMeterId: meterId, status: "needs_assignment" },
    select: { id: true, s3Key: true },
  });

  const withDay: { id: string; day: number | null }[] = [];
  for (const p of pending) {
    const read = await readAndParseIngest(p.s3Key);
    const day = "error" in read ? null : utcDayOf(read.parsed.rows[read.parsed.rows.length - 1].ts).getTime();
    withDay.push({ id: p.id, day });
  }
  withDay.sort((a, b) => {
    if (a.day === null) return 1;
    if (b.day === null) return -1;
    return a.day - b.day;
  });

  let applied = 0;
  let failed = 0;
  for (const { id } of withDay) {
    try {
      await applyIngestToMeter(id, meterId);
      applied++;
    } catch (err) {
      logger.warn("pump_room.apply_pending_failed", { ingestId: id, meterId, error: String(err) });
      failed++;
    }
  }
  return { applied, failed };
}

/**
 * Reads an ingest's stored bytes back from S3 and parses them — the one
 * place both `applyIngestToMeter` and the ordering step below do this, so
 * a file is read the identical way whichever one reads it.
 */
async function readAndParseIngest(s3Key: string): Promise<{ parsed: import("@/lib/pump-room-xlsx").PumpRoomParseResult } | { error: string }> {
  let bytes: Uint8Array;
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3Key }));
    bytes = await obj.Body!.transformToByteArray();
  } catch {
    return { error: "The file could not be read back from storage." };
  }
  const parsed = readPumpRoomWorkbook(bytes);
  if (parsed.rows.length === 0) {
    return { error: parsed.problems.join(" ") || "No usable rows were found in this file." };
  }
  return { parsed };
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
 * caller MUST process ingests in order of the CALENDAR DAY each file's own
 * data covers, not when the email arrived — see applyPendingIngestsForMeter.
 */
export async function applyIngestToMeter(ingestId: string, meterId: string): Promise<void> {
  const ingest = await db.emsPumpEmailIngest.findUnique({ where: { id: ingestId } });
  if (!ingest) throw new Error("That ingest no longer exists.");

  const read = await readAndParseIngest(ingest.s3Key);
  if ("error" in read) {
    await db.emsPumpEmailIngest.update({
      where: { id: ingestId },
      data: { status: "parse_failed", parseError: read.error, pumpMeterId: meterId },
    });
    return;
  }
  const parsed = read.parsed;

  const opening = parsed.rows[0]; // earliest ts in the file — parsePumpRoomSheet's own sort guarantees this
  const closing = parsed.rows[parsed.rows.length - 1]; // latest ts in the file
  const day = utcDayOf(closing.ts);

  // The vendor sends a second meter's reports under the same subject
  // (2026-11-19, found in RG's forwarded batches: decimal readings, no water
  // column, a register ~55,000 kWh away from the room's own). Once a room's
  // reports carry a water reading, a report without one is not this room's
  // meter — kept on record, never counted.
  if (closing.totalFlow === null) {
    const withWater = await db.emsPumpReading.findFirst({
      where: { pumpMeterId: meterId, origin: "ems_email", lastTotalFlow: { not: null } },
      select: { lastKwh: true },
    });
    if (withWater) {
      await db.emsPumpEmailIngest.update({
        where: { id: ingestId },
        data: {
          status: "parse_failed",
          pumpMeterId: meterId,
          rowCount: parsed.rows.length,
          parseError: `Not this pump room's meter: no water reading, and its register reads ${closing.kwh} kWh. This room's reports carry water readings. Kept on record, not counted.`,
        },
      });
      logger.warn("pump_room.ingest_other_meter", { ingestId, meterId, day: day.toISOString().slice(0, 10), kwh: closing.kwh });
      return;
    }
  }

  const [prior, existingDay] = await Promise.all([
    // Only a register-bearing day can be differenced against — a day typed
    // in from a report carries no registers at all (2026-11-13).
    db.emsPumpReading.findFirst({
      where: { pumpMeterId: meterId, date: { lt: day }, origin: "ems_email" },
      orderBy: { date: "desc" },
      select: { date: true, lastKwh: true, lastTotalFlow: true },
    }),
    db.emsPumpReading.findUnique({ where: { pumpMeterId_date: { pumpMeterId: meterId, date: day } }, select: { lastTs: true } }),
  ]);

  // A resend whose closing sample is no later than what's already stored
  // for this day is a harmless no-op — still clears a stale parseError
  // from an earlier failed attempt (2026-11-10, user-caught: a retried,
  // now-successful row kept showing the error text from its first,
  // failed try, because nothing had ever cleared it).
  if (existingDay?.lastTs && existingDay.lastTs.getTime() >= closing.ts.getTime()) {
    logger.info("pump_room.ingest_duplicate_day", { ingestId, meterId, day: day.toISOString() });
    await db.emsPumpEmailIngest.update({
      where: { id: ingestId },
      data: { status: "applied", appliedAt: new Date(), pumpMeterId: meterId, rowCount: parsed.rows.length, parseError: null },
    });
    return;
  }

  // A day is differenced against the report of the day BEFORE it; with no
  // report that day it is its own file's opening-to-closing span — "for the
  // current available data take the reading available in the sheet" — and
  // the missing days in between are SPREAD from the register rise across
  // them (src/lib/pump-gap.ts; 2026-11-18, user-specified after RG's 17 Nov
  // read 3,440 kWh, seven days on one).
  const consecutive = prior !== null && day.getTime() - prior.date.getTime() === DAY_MS;
  const priorBase = consecutive ? prior : null;
  const kwhFigure = deriveDailyFigure(closing.kwh, opening.kwh, priorBase?.lastKwh ?? null);
  // Water is optional — a day's file may not carry the total_flow column at
  // all, and that is not the same fact as "zero water that day".
  const flowFigure =
    closing.totalFlow !== null && opening.totalFlow !== null
      ? deriveDailyFigure(closing.totalFlow, opening.totalFlow, priorBase?.lastTotalFlow ?? null)
      : null;

  const dayFields = {
    lastKwh: closing.kwh,
    lastTotalFlow: closing.totalFlow,
    lastTs: closing.ts,
    openingKwh: opening.kwh,
    openingTotalFlow: opening.totalFlow,
    dailyKwh: kwhFigure.daily,
    registerWentBackwards: kwhFigure.wentBackwards,
    dailyKl: flowFigure?.daily ?? null,
    waterWentBackwards: flowFigure?.wentBackwards ?? false,
    sourceIngestId: ingestId,
  };

  await db.$transaction(async (tx) => {
    await tx.emsPumpReading.upsert({
      where: { pumpMeterId_date: { pumpMeterId: meterId, date: day } },
      create: { pumpMeterId: meterId, date: day, ...dayFields },
      // A day first typed in from a report, or spread across a gap, becomes a
      // read day the moment the vendor's own email for it lands.
      update: { origin: "ems_email", sourceDocumentId: null, ...dayFields },
    });

    // The gap before this day, measured up to this day's opening register.
    if (prior && !consecutive) {
      await respreadGap(tx, meterId, { date: prior.date, closingKwh: prior.lastKwh, closingFlow: prior.lastTotalFlow }, { date: day, openingKwh: opening.kwh, openingFlow: opening.totalFlow });
    }

    // The next report after this day was measured across a gap that this day
    // may have just closed or shortened — re-derive it and its gap.
    const next = await tx.emsPumpReading.findFirst({
      where: { pumpMeterId: meterId, date: { gt: day }, origin: "ems_email" },
      orderBy: { date: "asc" },
      select: { id: true, date: true, lastKwh: true, lastTotalFlow: true, openingKwh: true, openingTotalFlow: true, dailyKwh: true, dailyKl: true },
    });
    if (next) {
      if (next.date.getTime() - day.getTime() === DAY_MS) {
        const k = next.lastKwh !== null ? deriveDailyFigure(next.lastKwh, next.openingKwh ?? next.lastKwh, closing.kwh) : null;
        const f =
          next.lastTotalFlow !== null && closing.totalFlow !== null
            ? deriveDailyFigure(next.lastTotalFlow, next.openingTotalFlow ?? next.lastTotalFlow, closing.totalFlow)
            : null;
        await tx.emsPumpReading.update({
          where: { id: next.id },
          data: {
            ...(k ? { dailyKwh: k.daily, registerWentBackwards: k.wentBackwards } : {}),
            ...(f ? { dailyKl: f.daily, waterWentBackwards: f.wentBackwards } : {}),
          },
        });
      } else {
        // Still a gap after this day: the next report keeps its own span, and
        // the days between are re-spread from this day's closing. A report
        // stored before opening values were kept recovers its opening from
        // its own span.
        const nextOpeningKwh = next.openingKwh ?? (next.lastKwh !== null && next.dailyKwh !== null ? next.lastKwh - next.dailyKwh : null);
        const nextOpeningFlow = next.openingTotalFlow ?? (next.lastTotalFlow !== null && next.dailyKl !== null ? next.lastTotalFlow - next.dailyKl : null);
        await respreadGap(tx, meterId, { date: day, closingKwh: closing.kwh, closingFlow: closing.totalFlow }, { date: next.date, openingKwh: nextOpeningKwh, openingFlow: nextOpeningFlow });
      }
    }

    await tx.emsPumpMeter.update({
      where: { id: meterId },
      data: { lastKwh: closing.kwh, lastTotalFlow: closing.totalFlow, lastReadingAt: closing.ts, lastIngestAt: new Date() },
    });
    await tx.emsPumpEmailIngest.update({
      where: { id: ingestId },
      data: { status: "applied", appliedAt: new Date(), pumpMeterId: meterId, rowCount: parsed.rows.length, parseError: null },
    });
  });
}

const DAY_MS = 86_400_000;

/**
 * Replace the spread days between two reports. Days typed in from a filed
 * report sit in the same table and are never overwritten by a spread — if
 * any falls inside the gap, the gap is left as it is (the savings view then
 * estimates it), since dividing the register rise across days that already
 * carry their own figure would count that consumption twice.
 */
async function respreadGap(
  tx: Prisma.TransactionClient,
  meterId: string,
  prev: { date: Date; closingKwh: number | null; closingFlow: number | null },
  next: { date: Date; openingKwh: number | null; openingFlow: number | null },
): Promise<void> {
  const inside = { gt: prev.date, lt: next.date };
  await tx.emsPumpReading.deleteMany({ where: { pumpMeterId: meterId, origin: "distributed", date: inside } });
  const occupied = await tx.emsPumpReading.count({ where: { pumpMeterId: meterId, date: inside } });
  if (occupied > 0) return;
  const spread = spreadGap({
    prevDate: prev.date,
    prevClosingKwh: prev.closingKwh,
    prevClosingFlow: prev.closingFlow,
    nextDate: next.date,
    nextOpeningKwh: next.openingKwh,
    nextOpeningFlow: next.openingFlow,
  });
  if (!spread) return;
  await tx.emsPumpReading.createMany({
    data: spread.dates.map((date) => ({ pumpMeterId: meterId, date, origin: "distributed" as const, dailyKwh: spread.kwhPerDay, dailyKl: spread.klPerDay })),
  });
  logger.info("pump_room.gap_spread", {
    meterId,
    from: prev.date.toISOString().slice(0, 10),
    to: next.date.toISOString().slice(0, 10),
    days: spread.dates.length,
    kwhPerDay: spread.kwhPerDay,
    klPerDay: spread.klPerDay,
  });
}
