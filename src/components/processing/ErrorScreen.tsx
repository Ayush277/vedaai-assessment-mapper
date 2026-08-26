"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { JobError } from "@/lib/types/assessment";

export function ErrorScreen({
  error,
  onRetry,
}: {
  error: JobError;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-card border border-line bg-surface p-8 text-center">
        <span
          aria-hidden
          className="mx-auto grid size-14 place-items-center rounded-2xl bg-danger-soft"
        >
          <AlertTriangle className="size-7 text-danger" strokeWidth={1.8} />
        </span>
        <h1 className="mt-4 text-lg font-bold text-ink">Processing failed</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{error.message}</p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {error.retryable && onRetry ? (
            <Button onClick={onRetry}>
              <RotateCcw className="size-4" />
              Try again
            </Button>
          ) : null}
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-full border border-line bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-panel"
          >
            Upload different files
          </Link>
        </div>
      </div>
    </div>
  );
}
