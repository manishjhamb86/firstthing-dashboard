import Link from "next/link";
import { Card } from "@/components/ui";
import { teamMeta } from "@/lib/admin-teams";
import { requireFieldPage } from "../access";
import { FieldSignOut, PhoneStatus } from "./phone-status";
import { WaitingToSend } from "./waiting-to-send";

export const dynamic = "force-dynamic";
export const metadata = { title: "More" };

export default async function MorePage() {
  const me = await requireFieldPage();
  return (
    <>
      <header className="mb-5">
        <h1 className="text-[24px] font-bold leading-tight">More</h1>
      </header>

      <Card className="p-4 mb-4">
        <p className="font-semibold">{me.name ?? me.email}</p>
        <p className="text-[var(--text-muted)]">{me.email}</p>
        <p className="text-[var(--text-muted)]">{teamMeta(me.team).label}</p>
      </Card>

      <WaitingToSend />

      <PhoneStatus />

      <Card className="p-2 mb-4">
        <Link href="/admin/tasks" className="flex items-center min-h-[48px] px-2 font-semibold">
          Tasks
        </Link>
        <Link href="/field/inspections" className="flex items-center min-h-[48px] px-2 font-semibold border-t border-[var(--border-subtle)]">
          Inspections
        </Link>
        <Link href="/admin" className="flex items-center min-h-[48px] px-2 font-semibold border-t border-[var(--border-subtle)]">
          Open the back office
        </Link>
      </Card>

      <FieldSignOut />
    </>
  );
}
