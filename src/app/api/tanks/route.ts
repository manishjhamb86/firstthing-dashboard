import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTanksForSociety } from "@/lib/tanks";

export async function GET() {
  const session = await auth();

  if (!session?.user || session.user.role !== "customer" || !session.user.societyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tanks = await getTanksForSociety(session.user.societyId);
  return NextResponse.json({ tanks });
}
