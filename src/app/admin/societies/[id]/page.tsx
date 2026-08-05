import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import EditSocietyClient from "./edit-society-client";

export default async function EditSocietyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const { id } = await params;
  const societyId = Number(id);

  const society = await db.society.findUnique({ where: { id: societyId } });
  if (!society) notFound();

  const customerProfile = await db.profile.findFirst({
    where: { societyId, role: "customer" },
  });

  return (
    <EditSocietyClient
      society={{
        id: society.id,
        name: society.name,
        city: society.city ?? "",
        totalLights: society.totalLights,
        savingsPercentage: society.savingsPercentage.toNumber(),
      }}
      currentEmail={customerProfile?.email ?? ""}
    />
  );
}
