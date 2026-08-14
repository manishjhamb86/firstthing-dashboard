import { PageHeader } from "@/components/ui";
import { NewSocietyForm } from "./new-society-form";
import { requireAdminPage } from "@/lib/admin-permissions";

export default async function NewSocietyPage() {
  await requireAdminPage();

  return (
    <>
      <PageHeader title="New society" subtitle="Created as a prospect — minimal data, from a lead." />
      <NewSocietyForm />
    </>
  );
}
