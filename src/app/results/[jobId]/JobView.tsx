"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { JobRecord } from "@/lib/types/assessment";
import { ProcessingScreen } from "@/components/processing/ProcessingScreen";
import { ErrorScreen } from "@/components/processing/ErrorScreen";
import { ResultsScreen } from "@/components/results/ResultsScreen";
import { Spinner } from "@/components/ui/Spinner";

type JobResponse = JobRecord & { progress: number };

const POLL_INTERVAL_MS = 1200;

export function JobView({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [job, setJob] = useState<JobResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    try {
      const response = await fetch(`/api/process/${jobId}`, { cache: "no-store" });
      if (response.status === 404) {
        setLoadError(
          "This result is no longer available. Processing results are kept for one hour.",
        );
        return;
      }
      if (!response.ok) throw new Error("poll failed");

      const payload = (await response.json()) as JobResponse;
      setJob(payload);

      if (payload.status === "queued" || payload.status === "processing") {
        timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    } catch {
      // Transient network blips should not kill a long-running job view.
      timerRef.current = setTimeout(poll, POLL_INTERVAL_MS * 2);
    }
  }, [jobId]);

  useEffect(() => {
    void poll();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [poll]);

  if (loadError) {
    return (
      <ErrorScreen
        error={{ code: "INTERNAL", message: loadError, retryable: false }}
      />
    );
  }

  if (!job) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 p-6 text-sm text-muted">
        <Spinner className="text-brand" />
        Loading results…
      </div>
    );
  }

  if (job.status === "failed" && job.error) {
    return <ErrorScreen error={job.error} onRetry={() => router.push("/")} />;
  }

  if (job.status === "completed" && job.result) {
    return <ResultsScreen result={job.result} />;
  }

  return <ProcessingScreen stages={job.stages} progress={job.progress} />;
}
