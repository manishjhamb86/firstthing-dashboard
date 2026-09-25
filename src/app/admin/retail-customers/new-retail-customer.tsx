"use client";

import { useRouter } from "next/navigation";
import { RetailCustomerCreate } from "../billing/intake/[intakeId]/retail-customer-create";

export function NewRetailCustomerButton({ societies }: { societies: { id: string; name: string }[] }) {
  const router = useRouter();
  return (
    <RetailCustomerCreate
      label="New retail customer"
      prefill={{ name: "", gstin: "", address: "" }}
      societies={societies}
      onCreated={(c) => router.push(`/admin/retail-customers/${c.id}`)}
    />
  );
}
