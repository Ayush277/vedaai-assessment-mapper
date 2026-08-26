"use client";

import { FileText, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { fileKindLabel, formatBytes } from "@/lib/utils";

export function SelectedFileCard({
  file,
  role,
  onRemove,
  disabled,
}: {
  file: File;
  role: string;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const kind = fileKindLabel(file);

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="mb-3 text-[11px] font-semibold tracking-wide text-muted uppercase">
        {role}
      </p>
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-danger-soft text-[10px] font-bold text-danger-ink">
          <FileText className="size-5" strokeWidth={1.8} aria-hidden />
          <span className="sr-only">{kind}</span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink" title={file.name}>
            {file.name}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
            <span>{formatBytes(file.size)}</span>
            <span aria-hidden>•</span>
            <Badge tone="neutral" className="px-1.5 py-0">
              {kind}
            </Badge>
          </span>
        </span>

        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove ${file.name}`}
          className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-white transition-colors hover:bg-black disabled:bg-line disabled:text-muted"
        >
          <X className="size-3.5" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
