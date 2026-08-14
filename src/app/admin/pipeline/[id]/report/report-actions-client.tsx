"use client";

import { useState, useTransition } from "react";
import { ErrorText } from "@/components/ui";
import { generateDemoReport, shareDemoReport } from "./actions";

export function GenerateReportButton({ pipelineId, label }: { pipelineId: string; label: string }) {
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <button
        type="button"
        className="btn-primary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await generateDemoReport(pipelineId);
            setError(r?.error);
          })
        }
      >
        {pending ? "Generating…" : label}
      </button>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

export function ShareReportButton({ pipelineId, reportId }: { pipelineId: string; reportId: string }) {
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <button
        type="button"
        className="btn-primary btn-sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await shareDemoReport(pipelineId, reportId);
            setError(r?.error);
          })
        }
      >
        {pending ? "Sharing…" : "Share with the society"}
      </button>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
