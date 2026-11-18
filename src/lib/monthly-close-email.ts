import { db } from "@/lib/db";
import { formatDate, monthLabel } from "@/lib/format-date";
import { loadCloseRows } from "@/lib/monthly-close-loader";
import { publishedMonthsFor } from "@/lib/published-months-loader";
import {
  DEFAULT_MONTHLY_CLOSE_TEMPLATE, fillTemplate, inr, MONTHLY_CLOSE_TEMPLATE_KEY, type TemplateWord,
} from "@/lib/monthly-close";

/** The template on record, or the default until someone saves one. */
export async function loadMonthlyCloseTemplate() {
  const row = await db.messageTemplate.findUnique({
    where: { key: MONTHLY_CLOSE_TEMPLATE_KEY },
    select: { subject: true, body: true, updatedAt: true, updatedBy: { select: { name: true, email: true } } },
  });
  return row
    ? { subject: row.subject, body: row.body, updatedAt: row.updatedAt, updatedBy: row.updatedBy?.name ?? row.updatedBy?.email ?? null, isDefault: false }
    : { ...DEFAULT_MONTHLY_CLOSE_TEMPLATE, updatedAt: null, updatedBy: null, isDefault: true };
}

/** The filled subject and body for one society's month — what the email page previews and what is sent. */
export async function closeEmailValues(societyId: string, period: string) {
  const [row] = await loadCloseRows(period, societyId);
  if (!row) return null;
  const month = (await publishedMonthsFor(societyId)).months.find((m) => m.period === period) ?? null;
  const values: Record<TemplateWord, string | null> = {
    society: row.name,
    month: monthLabel(period),
    savings_pct: month?.savingsPct != null ? `${month.savingsPct.toFixed(1)}%` : null,
    saved_rupees: month ? inr(month.savedValue) : null,
    saved_kwh: month ? `${Math.round(month.savedKwh).toLocaleString("en-IN")} kWh` : null,
    invoice_no: row.invoice?.number ?? null,
    invoice_total: row.invoice ? inr(row.invoice.amount) : null,
    due_date: row.invoice ? formatDate(row.invoice.dueDate) : null,
  };
  const t = await loadMonthlyCloseTemplate();
  return { row, subject: fillTemplate(t.subject, values), body: fillTemplate(t.body, values) };
}

