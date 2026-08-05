import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [societiesCount, unpaidInvoicesCount] = await Promise.all([
    db.society.count(),
    db.invoice.count({ where: { NOT: { status: "Paid" } } }),
  ]);

  return NextResponse.json({ societiesCount, unpaidInvoicesCount });
}
