import { AdminNav } from "../../admin-nav";
import { NewSocietyForm } from "./new-society-form";

export default function NewSocietyPage() {
  return (
    <div className="min-h-screen p-10">
      <AdminNav />
      <h1 className="text-2xl font-bold mb-1">New society</h1>
      <p className="mb-8 text-[var(--text-muted)]">Created as a prospect — minimal data, from a lead.</p>
      <NewSocietyForm />
    </div>
  );
}
