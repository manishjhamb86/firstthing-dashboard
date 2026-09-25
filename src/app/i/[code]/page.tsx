import { redirect } from "next/navigation";
import { codeFromScan } from "@/lib/inventory";

/**
 * Where a printed label's QR code points (2026-09-25): a phone's own camera
 * opens this, and it lands on the unit — through sign-in first when needed,
 * which the admin area's own gate handles. Kept short on purpose: a shorter
 * link is a less dense QR code, which scans better off a small sticker.
 */
export default async function LabelLink({ params }: { params: Promise<{ code: string }> }) {
  const code = codeFromScan(decodeURIComponent((await params).code));
  redirect(/^B\d{4}-\d{3}$/.test(code) ? `/admin/inventory?code=${encodeURIComponent(code)}` : `/admin/inventory/units/${encodeURIComponent(code)}`);
}
