import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

// Minimal, not the approved theme system's shell (05a-theme-system.md) —
// that gets wired in once a milestone actually needs the full design system
// (globals.css's own MS-01 comment). Just enough to move between the admin
// screens that exist so far without knowing URLs by heart.
export function AdminNav() {
  return (
    <div className="flex items-center justify-between mb-8">
      <BrandMark className="h-7" />
      <nav className="flex gap-4 text-sm font-medium">
        <Link href="/admin" className="text-black/60 hover:text-black">
          Portfolio
        </Link>
        <Link href="/admin/societies" className="text-black/60 hover:text-black">
          Societies
        </Link>
        <Link href="/admin/users" className="text-black/60 hover:text-black">
          Users
        </Link>
      </nav>
    </div>
  );
}
