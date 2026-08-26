"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { JobError, JobRecord } from "@/lib/types/assessment";
import { ProcessingScreen } from "@/components/processing/ProcessingScreen";
import { ErrorScreen } from "@/components/processing/ErrorScreen";
import { ResultsScreen } from "@/components/results/ResultsScreen";
import { Spinner } from "@/components/ui/Spinner";

type JobResponse = JobRecord & { progress: number };

const POLL_INTERVAL_MS = 1200;
/** Give up after this many consecutive failed polls rather than spinning. */
const MAX_CONSECUTIVE_FAILURES = 10;
/**
 * A job that has not advanced in this long is not coming back — the server
 * process died, or a serverless instance was frozen mid-run. Comfortably longer
 * than the worst-case provider backoff chain so a slow run is never mistaken
 * for a dead one.
 */
const STALL_TIMEOUT_MS = 10 * 60 * 1000;

export function JobView({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [job, setJob] = useState<JobResponse | null>(null);
  const [loadError, setLoadError] = useState<JobError | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failureCountRef = useRef(0);

  const poll = useCallback(async () => {
    try {
      const response = await fetch(`/api/process/${jobId}`, { cache: "no-store" });
      if (response.status === 404) {
        setLoadError({
          code: "INTERNAL",
          message:
            "This result is no longer available. Processing results are kept for one hour.",
          retryable: false,
        });
        return;
      }
      if (!response.ok) throw new Error("poll failed");

      const payload = (await response.json()) as JobResponse;
      failureCountRef.current = 0;
      setJob(payload);

      if (payload.status !== "queued" && payload.status !== "processing") return;

      // Without this the page would spin forever on a job the server has
      // stopped working on, which is the one failure mode polling cannot see.
      if (Date.now() - payload.updatedAt > STALL_TIMEOUT_MS) {
        setLoadError({
          code: "INTERNAL",
          message:
            "Processing stopped responding partway through. This usually means the server was interrupted — please try again.",
          retryable: true,
        });
        return;
      }

      timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    } catch {
      // Transient network blips should not kill a long-running job view, but
      // an unreachable server should not leave the user staring at a spinner.
      failureCountRef.current += 1;
      if (failureCountRef.current >= MAX_CONSECUTIVE_FAILURES) {
        setLoadError({
          code: "INTERNAL",
          message:
            "Lost contact with the server while processing. Check your connection and try again.",
          retryable: true,
        });
        return;
      }
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
        error={loadError}
        onRetry={loadError.retryable ? () => router.push("/") : undefined}
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
