"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveLead } from "../actions";

export function ApproveLeadButton({ pipelineId }: { pipelineId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function approve() {
    startTransition(async () => {
      await approveLead(pipelineId);
      router.refresh();
    });
  }

  return (
    <button type="button" onClick={approve} disabled={pending} className="btn-primary btn-sm">
      {pending ? "Approving…" : "Approve — this lead is mine"}
    </button>
  );
}
