"use client";

import { useCallback, useRef, useState } from "react";
import type {
  AssessmentResult,
  JobError,
  StageProgress,
} from "@/lib/types/assessment";
import { initialStages } from "@/lib/processing/stages";
import { ProcessingScreen } from "@/components/processing/ProcessingScreen";
import { ErrorScreen } from "@/components/processing/ErrorScreen";
import { ResultsScreen } from "@/components/results/ResultsScreen";
import { UploadScreen } from "./UploadScreen";
import type { SetupState } from "./SetupGuide";

type Frame =
  | { type: "stage"; stages: StageProgress[]; progress: number }
  | { type: "result"; result: AssessmentResult }
  | { type: "error"; error: JobError };

type Phase =
  | { kind: "idle" }
  | { kind: "running"; stages: StageProgress[]; progress: number }
  | { kind: "done"; result: AssessmentResult }
  | { kind: "failed"; error: JobError };

/**
 * Owns one run from upload to results.
 *
 * The pipeline streams its progress down the upload request rather than being
 * polled, so everything about a run lives in this component's state for as long
 * as the request is open. That is what lets it work on a serverless host, where
 * a second request is not guaranteed to reach the instance doing the work.
 */
export function RunView({
  maxUploadMb,
  setup,
}: {
  maxUploadMb: number;
  setup: SetupState;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async (body: FormData) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({
      kind: "running",
      stages: initialStages(true),
      progress: 0,
    });

    try {
      const response = await fetch("/api/process", {
        method: "POST",
        body,
        signal: controller.signal,
      });

      // Validation failures come back as ordinary JSON, not as a stream.
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null);
        setPhase({
          kind: "failed",
          error: {
            code: "INVALID_FILE",
            message:
              payload?.error?.message ??
              "The files could not be submitted. Please try again.",
            retryable: false,
          },
        });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Newline-delimited JSON: a run of stage frames, then one terminal frame.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let frame: Frame;
          try {
            frame = JSON.parse(line) as Frame;
          } catch {
            continue; // a partial line; the next chunk completes it
          }

          if (frame.type === "stage") {
            setPhase({
              kind: "running",
              stages: frame.stages,
              progress: frame.progress,
            });
          } else if (frame.type === "result") {
            setPhase({ kind: "done", result: frame.result });
          } else if (frame.type === "error") {
            setPhase({ kind: "failed", error: frame.error });
          }
        }
      }

      // The stream ended without a terminal frame — the run was cut off.
      setPhase((current) =>
        current.kind === "running"
          ? {
              kind: "failed",
              error: {
                code: "INTERNAL",
                message:
                  "The connection closed before processing finished. This can happen on very long documents — try again, or upload fewer pages.",
                retryable: true,
              },
            }
          : current,
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error(error);
      setPhase({
        kind: "failed",
        error: {
          code: "INTERNAL",
          message:
            "Lost contact with the server while processing. Check your connection and try again.",
          retryable: true,
        },
      });
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setPhase({ kind: "idle" });
  }, []);

  if (phase.kind === "running") {
    return <ProcessingScreen stages={phase.stages} progress={phase.progress} />;
  }
  if (phase.kind === "failed") {
    return <ErrorScreen error={phase.error} onRetry={reset} />;
  }
  if (phase.kind === "done") {
    return <ResultsScreen result={phase.result} onStartOver={reset} />;
  }

  return (
    <UploadScreen maxUploadMb={maxUploadMb} setup={setup} onStart={start} />
  );
}
