import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import EnergyFormClient from "./energy-form-client";

export default async function EnergyPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const societies = await db.society.findMany({ orderBy: { name: "asc" } });

  return <EnergyFormClient societies={societies.map((s) => ({ id: s.id, name: s.name }))} />;
}
