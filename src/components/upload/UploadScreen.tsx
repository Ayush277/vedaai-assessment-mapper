"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowRight, GraduationCap, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { FileDropZone } from "./FileDropZone";
import { SelectedFileCard } from "./SelectedFileCard";

type Slot = "questionPaper" | "answerSheet";

const ACCEPTED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg"];

function validate(file: File, maxMb: number): string | null {
  const lower = file.name.toLowerCase();
  const extensionOk = ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
  if (!extensionOk) {
    return `"${file.name}" is not a supported format. Upload a PDF, PNG or JPG.`;
  }
  if (file.size === 0) {
    return `"${file.name}" is empty. Choose a different file.`;
  }
  if (file.size > maxMb * 1024 * 1024) {
    return `"${file.name}" is larger than the ${maxMb}MB limit.`;
  }
  return null;
}

export function UploadScreen({
  maxUploadMb,
  degraded,
}: {
  maxUploadMb: number;
  degraded: boolean;
}) {
  const router = useRouter();
  const [files, setFiles] = useState<Partial<Record<Slot, File>>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const select = useCallback(
    (slot: Slot, file: File) => {
      const message = validate(file, maxUploadMb);
      if (message) {
        setError(message);
        return;
      }
      setError(null);
      setFiles((current) => ({ ...current, [slot]: file }));
    },
    [maxUploadMb],
  );

  const remove = useCallback((slot: Slot) => {
    setError(null);
    setFiles((current) => {
      const next = { ...current };
      delete next[slot];
      return next;
    });
  }, []);

  const ready = Boolean(files.questionPaper && files.answerSheet);

  const submit = useCallback(async () => {
    if (!files.questionPaper || !files.answerSheet || submitting) return;

    setSubmitting(true);
    setError(null);

    const body = new FormData();
    body.append("questionPaper", files.questionPaper);
    body.append("answerSheet", files.answerSheet);

    try {
      const response = await fetch("/api/process", { method: "POST", body });
      const payload = (await response.json()) as {
        jobId?: string;
        error?: { message?: string };
      };

      if (!response.ok || !payload.jobId) {
        setError(
          payload.error?.message ??
            "The files could not be submitted. Please try again.",
        );
        setSubmitting(false);
        return;
      }
      router.push(`/results/${payload.jobId}`);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setSubmitting(false);
    }
  }, [files, router, submitting]);

  return (
    <div className="scrollbar-slim flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center px-5 py-10 sm:py-14">
        <h1 className="text-center text-[26px] leading-tight font-bold tracking-tight text-ink sm:text-[34px]">
          Upload{" "}
          <span className="brand-underline text-brand">
            Question Paper &amp; Answer Sheets
          </span>
        </h1>
        <p className="mt-2 text-center text-sm text-ink-soft">
          Upload both files to get started
        </p>

        <span
          aria-hidden
          className="relative mt-7 grid size-24 place-items-center rounded-full bg-brand-soft ring-8 ring-brand-soft/40"
        >
          <GraduationCap className="size-10 text-brand" strokeWidth={1.5} />
          {[
            "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2",
            "right-0 top-1/2 translate-x-1/2 -translate-y-1/2",
            "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2",
            "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2",
          ].map((position) => (
            <span
              key={position}
              className={`absolute size-2.5 rounded-full bg-brand ${position}`}
            />
          ))}
        </span>

        <div className="mt-9 grid w-full gap-4 sm:grid-cols-2">
          {files.questionPaper ? (
            <SelectedFileCard
              file={files.questionPaper}
              role="Question paper"
              onRemove={() => remove("questionPaper")}
              disabled={submitting}
            />
          ) : (
            <FileDropZone
              title="Upload"
              accentTitle="Question Paper"
              maxMb={maxUploadMb}
              onSelect={(file) => select("questionPaper", file)}
              disabled={submitting}
            />
          )}

          {files.answerSheet ? (
            <SelectedFileCard
              file={files.answerSheet}
              role="Student answer sheet"
              onRemove={() => remove("answerSheet")}
              disabled={submitting}
            />
          ) : (
            <FileDropZone
              title="Upload"
              accentTitle="Answer Sheet"
              maxMb={maxUploadMb}
              onSelect={(file) => select("answerSheet", file)}
              disabled={submitting}
            />
          )}
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-5 flex w-full items-start gap-2 rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger-ink"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        ) : null}

        <Button
          size="lg"
          onClick={submit}
          disabled={!ready || submitting}
          className="mt-8 min-w-[190px]"
        >
          {submitting ? (
            <>
              <Spinner /> Starting…
            </>
          ) : (
            <>
              Start Mapping <ArrowRight className="size-4" />
            </>
          )}
        </Button>

        <p className="mt-3 text-center text-xs text-muted">
          {ready
            ? "Both files are ready. Processing takes about a minute per page."
            : "Once both files are uploaded, you'll be able to map answers with questions"}
        </p>

        {degraded ? (
          <p className="mt-6 flex max-w-xl items-start gap-2 rounded-xl border border-warn/25 bg-warn-soft px-4 py-3 text-xs text-warn">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>
              No AI provider is configured, so extraction runs on local Tesseract
              OCR. Printed question papers read well; handwriting recognition will
              be poor. Set <code className="font-mono">AI_API_KEY</code> in{" "}
              <code className="font-mono">.env.local</code> for full accuracy.
            </span>
          </p>
        ) : null}

        <Link
          href="/demo"
          className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-brand"
        >
          <Sparkles className="size-3.5" />
          Explore a sample result without uploading
        </Link>
      </div>
    </div>
  );
}
