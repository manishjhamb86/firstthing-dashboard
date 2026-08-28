import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-permissions";
import { Card, CardTitle, EmptyState, PageHeader } from "@/components/ui";
import { DailyBars, MeterAlerts, MeterHourlyChart, MeterReadout, MeterStateChip } from "@/components/meter-ui";
import { meterHourly, meterRow } from "@/lib/meter-view";
import { db } from "@/lib/db";
import { MeterDetailActions } from "./meter-detail-client";

export default async function MeterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdminPage();
  if (!actor) redirect("/api/session-ended");
  const { id } = await params;

  const meter = await meterRow(id);
  if (!meter) notFound();

  const [days, imports, alertHistory] = await Promise.all([
    meterHourly(id, 14),
    db.meterCsvImport.findMany({
      where: { meterId: id },
      orderBy: { uploadedAt: "desc" },
      take: 8,
      select: {
        id: true,
        fileName: true,
        firstDay: true,
        lastDay: true,
        hoursInFile: true,
        hoursSuperseded: true,
        matchMethod: true,
        overrodeMatch: true,
        uploadedAt: true,
        uploadedBy: { select: { name: true, email: true } },
      },
    }),
    db.meterAlert.findMany({
      where: { meterId: id },
      orderBy: { openedAt: "desc" },
      take: 5,
      select: { id: true, kind: true, message: true, openedAt: true, closedAt: true, closedReason: true },
    }),
  ]);

  // The meter's recent life as one list: alerts opening and closing, files
  // arriving. Assembled here rather than stored — every entry already has a
  // row of record behind it.
  const events: { at: Date; tone: "ok" | "warn" | "bad" | "info"; text: string }[] = [];
  for (const a of alertHistory) {
    events.push({
      at: a.openedAt,
      tone: a.kind === "offline" ? "bad" : "warn",
      text: a.message,
    });
    if (a.closedAt) {
      events.push({ at: a.closedAt, tone: "ok", text: a.closedReason ?? "Alert closed." });
    }
  }
  for (const i of imports) {
    events.push({
      at: i.uploadedAt,
      tone: "info",
      text: `History imported: ${i.hoursInFile.toLocaleString()} hours from ${i.fileName}${i.overrodeMatch ? " — meter chosen by hand" : ""}.`,
    });
  }
  events.sort((a, b) => b.at.getTime() - a.at.getTime());
  const recentEvents = events.slice(0, 6);
  const EVENT_TONE = { ok: "var(--signal)", warn: "var(--warn-fg)", bad: "var(--bad-fg)", info: "var(--chart-mark)" } as const;

  const canManage = actor.user.adminPermissions.includes("manage_users");

  return (
    <>
      <PageHeader
        backHref="/admin/meters"
        title={meter.name}
        chip={<MeterStateChip state={meter.state} />}
        subtitle={
          <>
            {meter.productModel} · device type {meter.uiid}
            {meter.societyName && (
              <>
                {" · "}
                <Link href={`/admin/societies/${meter.societyId}`} className="underline">
                  {meter.societyName}
                </Link>
              </>
            )}
            {meter.circuitLabel && ` · ${meter.circuitLabel}`}
          </>
        }
      />

      <div className="space-y-6">
        <MeterAlerts meter={meter} />

        <MeterReadout
          meter={meter}
          action={canManage ? <MeterDetailActions meterId={meter.id} mode="read" /> : undefined}
        />

        <Card className="p-6">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div>
              <CardTitle>What this meter measures</CardTitle>
              <p className="mt-1 text-[13px] text-[var(--text-muted)]">
                The circuit it is bound to, and who is chased when it stops answering.
              </p>
            </div>
          </div>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Society" value={meter.societyName} href={meter.societyId ? `/admin/societies/${meter.societyId}` : null} missing="Not assigned" />
            <Detail
              label="Circuit"
              value={meter.circuitLabel}
              href={meter.circuitId && meter.societyId ? `/admin/societies/${meter.societyId}/circuits/${meter.circuitId}` : null}
              missing="Not assigned — nothing is billed against this meter"
            />
            <Detail
              label="Daily ceiling"
              value={meter.capacityKwh === null ? null : `${meter.capacityKwh.toFixed(2)} kWh`}
              missing="No load inventory on the circuit"
            />
            <Detail label="Chased when it stops" value={meter.ownerLabel} missing="Nobody named" />
          </dl>
        </Card>

        {days.length > 0 && (
          <Card className="p-6">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div>
                <CardTitle>Daily consumption — last {days.length} days</CardTitle>
                <p className="mt-1 text-[13px] text-[var(--text-muted)]">
                  A change in the circuit&rsquo;s life reads here first — a retrofit is a cliff in
                  this chart. The hour-by-hour view below answers when within each day.
                </p>
              </div>
            </div>
            <DailyBars days={days} />
          </Card>
        )}

        <Card className="p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <div>
              <CardTitle>Hour by hour{days.length > 0 ? ` — last ${Math.min(7, days.length)} days` : ""}</CardTitle>
              <p className="mt-1 text-[13px] text-[var(--text-muted)]">
                From the meter&rsquo;s own exported history. The live API gives a running counter,
                never the hours themselves, so this series only grows when an export is uploaded.
              </p>
            </div>
            {canManage && <MeterDetailActions meterId={meter.id} mode="upload" />}
          </div>

          {days.length === 0 ? (
            <EmptyState title="No hourly history yet">
              Download the history CSV from this meter in the eWeLink app and upload it here. The system
              works out which meter it belongs to by comparing it against what is already stored.
            </EmptyState>
          ) : (
            <MeterHourlyChart days={days.slice(0, 7)} />
          )}
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <CardTitle>Events</CardTitle>
            <p className="mt-1 text-[13px] text-[var(--text-muted)]">
              Alerts open on the second consecutive failure and close themselves with a stated reason.
            </p>
            {recentEvents.length === 0 ? (
              <p className="mt-4 text-[13px] text-[var(--text-subtle)]">
                Nothing yet — no alerts have been raised and no history has been imported.
              </p>
            ) : (
              <ul className="mt-3">
                {recentEvents.map((e, i) => (
                  <li
                    key={i}
                    className="flex gap-3.5 border-t py-3"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: EVENT_TONE[e.tone] }}
                    />
                    <div>
                      <p className="text-[13px]">{e.text}</p>
                      <p className="num mt-0.5 text-[11px] text-[var(--text-subtle)]">
                        {e.at.toISOString().slice(0, 16).replace("T", " ")}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {imports.length > 0 ? (
            <Card className="p-6">
              <CardTitle>Imports</CardTitle>
              <p className="mt-1 text-[13px] text-[var(--text-muted)]">
                Every hourly series traces to the file it came from and how the meter was matched.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>File</th>
                      <th>Covers</th>
                      <th className="text-right">Hours</th>
                      <th>Matched by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {imports.map((i) => (
                      <tr key={i.id}>
                        <td className="font-medium">{i.fileName}</td>
                        <td className="num whitespace-nowrap text-[13px]">
                          {i.firstDay.toISOString().slice(0, 10)} → {i.lastDay.toISOString().slice(0, 10)}
                        </td>
                        <td className="num text-right">
                          {i.hoursInFile.toLocaleString()}
                          {i.hoursSuperseded > 0 && (
                            <div className="text-xs" style={{ color: "var(--warn-fg)" }}>
                              {i.hoursSuperseded} replaced
                            </div>
                          )}
                        </td>
                        <td className="text-[13px]">
                          {i.overrodeMatch ? (
                            <span style={{ color: "var(--warn-fg)" }}>Chosen by hand</span>
                          ) : (
                            <span style={{ color: "var(--ok-fg)" }}>Overlapping hours</span>
                          )}
                          <div className="text-xs text-[var(--text-subtle)]">
                            {i.uploadedBy.name ?? i.uploadedBy.email}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <Card className="p-6">
              <CardTitle>Imports</CardTitle>
              <p className="mt-4 text-[13px] text-[var(--text-subtle)]">
                No exports have been uploaded for this meter yet.
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Detail({
  label,
  value,
  href,
  missing,
}: {
  label: string;
  value: string | null;
  href?: string | null;
  missing: string;
}) {
  return (
    <div>
      <dt className="lbl mb-1">{label}</dt>
      <dd className="text-[15px]">
        {value === null ? (
          <span className="text-[13px] text-[var(--text-subtle)]">{missing}</span>
        ) : href ? (
          <Link href={href} className="underline">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
