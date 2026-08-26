"use client";

import { Check, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/Spinner";
import type { StageProgress } from "@/lib/types/assessment";

export function ProcessingScreen({
  stages,
  progress,
}: {
  stages: StageProgress[];
  progress: number;
}) {
  const active = stages.find((stage) => stage.state === "active");

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <span
          aria-hidden
          className="mx-auto grid size-16 place-items-center rounded-2xl bg-brand-soft"
        >
          <Sparkles className="size-8 animate-veda-pulse text-brand" strokeWidth={1.8} />
        </span>

        <h1 className="mt-5 text-[26px] font-bold tracking-tight text-ink">
          Extracting<span className="text-brand">…</span>
        </h1>
        <p
          className="mt-1 text-sm text-ink-soft"
          role="status"
          aria-live="polite"
        >
          {active ? `${active.label}${active.detail ? ` · ${active.detail}` : ""}` : "This may take a while"}
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
            className="relative h-full overflow-hidden rounded-full bg-brand transition-[width] duration-500 ease-out"
            style={{ width: `${Math.max(4, progress)}%` }}
          >
            <span className="animate-veda-sheen absolute inset-0" />
          </div>
        </div>
        <p className="mt-1.5 text-[11px] font-medium text-muted tabular-nums">
          {progress}% · stage {stages.filter((s) => s.state !== "pending").length} of{" "}
          {stages.length}
        </p>

        <ol className="mt-6 space-y-1 text-left">
          {stages.map((stage) => (
            <li
              key={stage.stage}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition-colors",
                stage.state === "active" && "bg-surface font-medium text-ink shadow-sm",
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
                <span className="shrink-0 text-[11px] text-muted">{stage.detail}</span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
