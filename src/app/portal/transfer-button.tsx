"use client";

import { useActionState } from "react";
import { transferOfficeBearer } from "./actions";

async function action(_prev: string | undefined, formData: FormData) {
  const profileId = formData.get("profileId") as string;
  const result = await transferOfficeBearer(profileId);
  return result.error;
}

export function TransferButton({ profileId }: { profileId: string }) {
  const [error, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="profileId" value={profileId} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-60"
      >
        {pending ? "Transferring…" : "Make office-bearer"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
