"use client";

import { FileText, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn, fileKindLabel, formatBytes } from "@/lib/utils";
import { studentNameFromFile } from "@/lib/students";

/**
 * The class as it stands before processing.
 *
 * Names are resolved here, before upload, so the teacher can see how each file
 * will be labelled and fix a misnamed one by re-uploading rather than
 * discovering it halfway through marking.
 */
export function StudentFileList({
  files,
  onRemove,
  onClear,
  disabled,
}: {
  files: File[];
  onRemove: (index: number) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  if (files.length === 0) return null;

  return (
    <div className="rounded-card border border-line bg-surface p-3">
      <div className="mb-2 flex items-center gap-2">
        <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">
          Student answer sheets
        </p>
        <Badge tone="brand" className="px-1.5">
          {files.length}
        </Badge>
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-muted transition-colors hover:bg-panel hover:text-danger-ink disabled:opacity-50"
        >
          <Trash2 className="size-3" />
          Clear all
        </button>
      </div>

      <ul className="scrollbar-slim max-h-56 space-y-1.5 overflow-y-auto pr-1">
        {files.map((file, index) => (
          <li
            key={`${file.name}-${index}`}
            className={cn(
              "animate-veda-swap-in flex items-center gap-2.5 rounded-xl border border-line bg-panel/50 p-2",
              "transition-colors hover:border-line-strong hover:bg-panel",
            )}
            style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
              <FileText className="size-4" strokeWidth={1.8} aria-hidden />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-ink">
                {studentNameFromFile(file.name, index)}
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-muted">
                <span className="truncate" title={file.name}>
                  {file.name}
                </span>
                <span aria-hidden>·</span>
                <span className="shrink-0">{formatBytes(file.size)}</span>
                <span aria-hidden>·</span>
                <span className="shrink-0">{fileKindLabel(file)}</span>
              </span>
            </span>

            <button
              type="button"
              onClick={() => onRemove(index)}
              disabled={disabled}
              aria-label={`Remove ${file.name}`}
              className="grid size-6 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-danger-soft hover:text-danger-ink disabled:opacity-50"
            >
              <X className="size-3.5" strokeWidth={2.5} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
