"use client";

import { Check, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/Spinner";
import type { StageProgress } from "@/lib/types/assessment";

/**
 * The extraction state.
 *
 * Every moving part is tied to something real: the ring turns while work is in
 * flight, the bar tracks completed stages, and each row changes state only when
 * the backend says it has. Nothing here animates on a timer pretending to be
 * progress.
 */
export function ProcessingScreen({
  stages,
  progress,
}: {
  stages: StageProgress[];
  progress: number;
}) {
  const active = stages.find((stage) => stage.state === "active");
  const settled = stages.filter(
    (stage) => stage.state === "done" || stage.state === "skipped",
  ).length;

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="animate-veda-fade-up w-full max-w-md text-center">
        <span
          aria-hidden
          className="relative mx-auto grid size-20 place-items-center rounded-full bg-brand-soft"
        >
          <span className="animate-veda-orbit absolute inset-0 rounded-full border-2 border-brand/25 border-t-brand" />
          <Sparkles
            className="size-8 animate-veda-pulse text-brand"
            strokeWidth={1.8}
          />
        </span>

        <h1 className="mt-5 text-[26px] font-bold tracking-tight text-ink">
          Extracting<span className="text-brand">…</span>
        </h1>
        <p className="mt-1 min-h-5 text-sm text-ink-soft" role="status" aria-live="polite">
          {active
            ? `${active.label}${active.detail ? ` · ${active.detail}` : ""}`
            : "This may take a while"}
        </p>

        <div
          className="relative mt-6 h-1.5 w-full overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Processing progress"
        >
          <div
            className="relative h-full overflow-hidden rounded-full bg-brand transition-[width] duration-700 ease-out"
            style={{ width: `${Math.max(4, progress)}%` }}
          >
            <span className="animate-veda-sheen absolute inset-0" />
          </div>
        </div>
        <p className="mt-1.5 text-[11px] font-medium text-muted tabular-nums">
          {progress}% · {settled} of {stages.length} stages complete
        </p>

        <ol className="mt-6 space-y-1 text-left">
          {stages.map((stage, index) => (
            <li
              key={stage.stage}
              style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              className={cn(
                "animate-veda-stage-in flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition-colors duration-300",
                stage.state === "active" &&
                  "bg-surface font-medium text-ink shadow-sm ring-1 ring-brand/20",
                stage.state === "done" && "text-ink-soft",
                stage.state === "pending" && "text-muted",
                stage.state === "skipped" && "text-muted line-through",
                stage.state === "failed" && "bg-danger-soft text-danger-ink",
              )}
            >
              <span className="grid size-4 shrink-0 place-items-center">
                {stage.state === "done" ? (
                  <Check className="size-3.5 text-success" strokeWidth={3} />
                ) : stage.state === "active" ? (
                  <Spinner className="size-3.5 text-brand" />
                ) : stage.state === "failed" ? (
                  <X className="size-3.5" strokeWidth={3} />
                ) : (
                  <span className="size-1.5 rounded-full bg-line-strong" />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate">{stage.label}</span>
              {stage.detail ? (
                <span className="max-w-[46%] shrink-0 truncate text-[11px] text-muted">
                  {stage.detail}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
