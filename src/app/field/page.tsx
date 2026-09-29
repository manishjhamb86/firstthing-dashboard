import Link from "next/link";
import { db } from "@/lib/db";
import { EmptyState, StatusChip } from "@/components/ui";
import { formatDate, longDate } from "@/lib/format-date";
import { SCHEDULE_KIND, scheduleEventHref, timeLabel } from "@/lib/schedule";
import { firstName, greetingFor, istWallClock, planToday } from "@/lib/field-today";
import { loadFieldWork } from "@/lib/field-work";
import { requireFieldPage } from "./access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Today" };

type Entry = {
  id: string;
  kind: keyof typeof SCHEDULE_KIND;
  title: string;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  societyName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  href: string | null;
};

/**
 * Today (docs/engineering/19-field-app.md §8 step 2): what this person is due
 * to do, from the one schedule every appointment lives on — survey visits,
 * replacement days, meetings and tasks set for them.
 */
export default async function TodayPage() {
  const me = await requireFieldPage();
  const wall = istWallClock(new Date());

  const [events, work] = await Promise.all([
    db.scheduledEvent.findMany({
      where: { assigneeId: me.id, status: "scheduled" },
      orderBy: { startAt: "asc" },
      take: 200,
      include: { society: { select: { name: true } } },
    }),
    loadFieldWork(me.id, true),
  ]);

  const entries: Entry[] = events.map((e) => ({
    id: e.id,
    kind: e.kind,
    title: e.title,
    startAt: e.startAt,
    endAt: e.endAt,
    allDay: e.allDay,
    societyName: e.society?.name ?? null,
    contactName: e.contactName,
    contactPhone: e.contactPhone,
    href: scheduleEventHref(e),
  }));
  const plan = planToday(entries, wall);
  const unscheduled = work.filter((w) => w.kind !== "installation" && w.visitAt === null);

  return (
    <>
      <header className="mb-5">
        <p className="text-[15px] text-[var(--text-muted)]">{longDate(wall)}</p>
        <h1 className="text-[24px] font-bold leading-tight">
          {greetingFor(wall)}, {firstName(me.name, me.email)}
        </h1>
      </header>

      <div className="grid grid-cols-3 gap-2 mb-6">
        <CountTile label="today" value={plan.today.length} />
        <CountTile label="overdue" value={plan.overdue.length} warn={plan.overdue.length > 0} />
        <CountTile label="next 7 days" value={plan.soon.length} />
      </div>

      {plan.overdue.length > 0 && (
        <Section title="Not closed out">
          {plan.overdue.map((e) => (
            <EntryCard key={e.id} e={e} overdue />
          ))}
        </Section>
      )}

      <Section title="Today">
        {plan.today.length === 0 ? (
          <EmptyState title="Nothing booked for today">
            Visits, replacement days and tasks set for you appear here on their day.
          </EmptyState>
        ) : (
          plan.today.map((e) => <EntryCard key={e.id} e={e} />)
        )}
      </Section>

      {plan.soon.length > 0 && (
        <Section title="Coming up">
          {plan.soon.map((e) => (
            <EntryCard key={e.id} e={e} showDate />
          ))}
          {plan.laterCount > 0 && (
            <p className="text-[var(--text-muted)]">and {plan.laterCount} more after that.</p>
          )}
        </Section>
      )}

      {unscheduled.length > 0 && (
        <Link
          href="/field/work"
          className="card block p-4 mt-2"
          style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)", color: "var(--warn-fg)" }}
        >
          <span className="font-semibold">
            {unscheduled.length} {unscheduled.length === 1 ? "job has" : "jobs have"} no visit booked
          </span>
          <span className="block">Open My work to see which.</span>
        </Link>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="lbl mb-2">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function CountTile({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div
      className="card p-3"
      style={warn ? { borderColor: "var(--warn-line)", background: "var(--warn-bg)", color: "var(--warn-fg)" } : undefined}
    >
      <div className="num text-[24px] font-bold leading-none">{value}</div>
      <div className="text-[15px] mt-1" style={warn ? undefined : { color: "var(--text-muted)" }}>
        {label}
      </div>
    </div>
  );
}

function EntryCard({ e, overdue, showDate }: { e: Entry; overdue?: boolean; showDate?: boolean }) {
  const time = e.kind === "task" && e.allDay ? "Any time" : timeLabel(e.startAt, e.endAt);
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <StatusChip tone={overdue ? "warn" : "info"}>{SCHEDULE_KIND[e.kind].label}</StatusChip>
        <span className="num font-semibold">
          {showDate || overdue ? `${formatDate(e.startAt)} · ` : ""}
          {time}
        </span>
      </div>
      <p className="font-semibold mt-2">{e.title}</p>
      {e.societyName && !e.title.includes(e.societyName) && (
        <p className="text-[var(--text-muted)]">{e.societyName}</p>
      )}
      {e.contactName && (
        <p className="text-[var(--text-muted)]">Ask for {e.contactName}</p>
      )}
    </>
  );
  return (
    <div className="card p-4">
      {e.href ? (
        <Link href={e.href} className="block">
          {body}
        </Link>
      ) : (
        body
      )}
      {e.contactPhone && (
        <a
          href={`tel:${e.contactPhone}`}
          className="btn-secondary mt-3 inline-flex items-center justify-center min-h-[48px] w-full"
        >
          Call {e.contactName ?? e.contactPhone}
        </a>
      )}
    </div>
  );
}
