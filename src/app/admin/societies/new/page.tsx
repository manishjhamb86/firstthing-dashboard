import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { NewSocietyForm } from "./new-society-form";

export default async function NewSocietyPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  return (
    <>
      <PageHeader title="New society" subtitle="Created as a prospect — minimal data, from a lead." />
      <NewSocietyForm />
    </>
  );
}
