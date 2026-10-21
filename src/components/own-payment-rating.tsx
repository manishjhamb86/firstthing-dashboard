// A society's own payment rating, shown only to that society (2026-10-21,
// the user's call: "stars public, own rating private"). Facts only: each
// unpaid invoice is stated plainly with its number, amount and due date, and
// the published rule sits beside the figure so the society can check it.
// Never the word "defaulter", never a comparison with another society.

import Link from "next/link";
import { Card, CardTitle } from "@/components/ui";
import { StarRating } from "@/components/star-rating";
import { formatDate } from "@/lib/format-date";
import { MIN_RATED_INVOICES, RATING_RULE, STAR_BANDS, qualifiesToEnter, type PaymentRating } from "@/lib/payment-rating";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthYear = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function OwnPaymentRating({
  rating,
  listedUntil,
  full = false,
}: {
  rating: PaymentRating;
  /** When this society is on the star showcase, the day it stops; else null. */
  listedUntil: Date | null;
  /** The billing page shows the unpaid invoices and the rule; the dashboard only the figure. */
  full?: boolean;
}) {
  const band = rating.stars !== null ? STAR_BANDS.find((b) => b.stars === rating.stars) : null;
  const open = rating.invoices.filter((i) => i.open);
  return (
    <Card className="p-6">
      <CardTitle>Your payment rating</CardTitle>
      {rating.stars === null ? (
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          Not rated yet. A rating appears once {MIN_RATED_INVOICES} invoices have fallen due
          {rating.counted > 0 && ` — ${rating.counted} so far`}.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <StarRating stars={rating.stars} size={22} />
            <span className="text-[14px] font-semibold">
              {rating.capped ? "Held at 2 stars while an invoice is unpaid more than 30 days" : band?.label}
            </span>
          </div>
          <p className="mt-2 text-[13px]" style={{ color: "var(--text-muted)" }}>
            {rating.onTimeCount} of {rating.counted} invoices paid on time since {rating.since ? monthYear(rating.since) : "—"}
            {rating.avgDaysLate !== null && rating.avgDaysLate > 0 && ` · ${rating.avgDaysLate} days late on average`}.
          </p>
        </>
      )}

      {open.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5 text-[13px]">
          {(full ? open : open.slice(0, 1)).map((i) => (
            <li key={i.id} style={{ color: "var(--warn-fg)" }}>
              Invoice {i.number} of {rupees(i.amount)} was due on {formatDate(i.dueOn)} and is unpaid as of {formatDate(rating.asOf)}.
            </li>
          ))}
          {!full && open.length > 1 && <li style={{ color: "var(--text-subtle)" }}>and {open.length - 1} more.</li>}
        </ul>
      )}

      <p className="mt-3 text-[13px]">
        {listedUntil ? (
          <>Your society is shown to other societies as a star partner until {formatDate(listedUntil)}.</>
        ) : qualifiesToEnter(rating) ? (
          <>Your society qualifies to be shown to other societies as a star partner. Ask us — we show a society only with its committee&apos;s consent.</>
        ) : rating.stars !== null ? (
          <>Societies that pay every invoice by its due date can be shown to other societies as star partners.</>
        ) : null}
      </p>

      {full ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-[13px] font-semibold">How the rating is worked out</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            {RATING_RULE.map((line) => (
              <li key={line}>{line}</li>
            ))}
            <li>{STAR_BANDS.map((b) => `${b.stars}★ ${b.label.toLowerCase()}`).join(" · ")}.</li>
          </ul>
        </details>
      ) : (
        <Link href="/portal/billing#payment-rating" className="mt-3 inline-block text-[13px] font-semibold underline">
          How it is worked out
        </Link>
      )}
    </Card>
  );
}
