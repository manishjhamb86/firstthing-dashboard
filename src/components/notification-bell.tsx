import Link from "next/link";

/**
 * The badge in the top bar. Counts OPEN and UNACKNOWLEDGED alerts — the
 * number is "how much is unattended", not "how much is wrong", or a meter
 * that stays down all week keeps the badge lit forever and it stops meaning
 * anything.
 */
export function NotificationBell({ count }: { count: number }) {
  return (
    <Link
      href="/admin/notifications"
      aria-label={count === 0 ? "Notifications" : `Notifications — ${count} unattended`}
      title={count === 0 ? "Notifications" : `${count} unattended`}
      className="relative inline-flex items-center justify-center rounded-[var(--r-sm)]"
      style={{ width: 36, height: 32, color: "var(--chrome-text)" }}
    >
      <svg viewBox="0 0 20 20" style={{ width: 18, height: 18 }} aria-hidden>
        <path
          d="M10 2.5a4.5 4.5 0 0 0-4.5 4.5v2.8L4 12.5h12l-1.5-2.7V7A4.5 4.5 0 0 0 10 2.5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M8 15a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      {count > 0 && (
        <span
          className="num absolute flex items-center justify-center rounded-full text-[10px] font-bold"
          style={{
            top: 1,
            right: 1,
            minWidth: 16,
            height: 16,
            padding: "0 4px",
            background: "var(--bad-fg)",
            color: "#FFFFFF",
          }}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
