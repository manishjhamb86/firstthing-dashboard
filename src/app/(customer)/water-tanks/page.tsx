import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTanksForSociety } from "@/lib/tanks";
import WaterTanksClient from "./water-tanks-client";

export default async function WaterTanksPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tanks = session.user.societyId ? await getTanksForSociety(session.user.societyId) : [];

  return <WaterTanksClient initialTanks={tanks} />;
}
