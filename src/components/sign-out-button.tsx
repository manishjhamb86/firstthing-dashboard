import { logoutAction } from "@/app/logout-actions";

// Wired to next-auth's own signOut (src/lib/auth.ts) — exported since MS-01
// but never actually surfaced by any button until now (user-caught gap,
// 2026-08-14): the archived app had one (archive/src/components/shell/
// Sidebar.tsx), the greenfield rebuild's chrome never carried it forward.
export function SignOutButton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <form action={logoutAction}>
      <button type="submit" className={className} style={style}>
        Sign out
      </button>
    </form>
  );
}
