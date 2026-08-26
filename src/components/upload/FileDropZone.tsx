"use client";

import { useCallback, useId, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";

export function FileDropZone({
  title,
  accentTitle,
  maxMb,
  onSelect,
  disabled,
}: {
  title: string;
  accentTitle: string;
  maxMb: number;
  onSelect: (file: File) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const describedBy = useId();

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onSelect(file);
    },
    [onSelect],
  );

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!disabled) handleFiles(event.dataTransfer.files);
      }}
      className={cn(
        "rounded-card border-2 border-dashed bg-surface transition-colors",
        dragging ? "border-brand bg-brand-soft/40" : "border-line-strong",
        disabled && "opacity-60",
      )}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        aria-describedby={describedBy}
        className="flex w-full flex-col items-center gap-3 px-6 py-10 text-center disabled:cursor-not-allowed"
      >
        <span className="grid size-11 place-items-center rounded-xl border border-line bg-panel text-ink-soft">
          <Upload className="size-5" strokeWidth={1.8} />
        </span>
        <span className="text-[15px] font-semibold text-ink">
          {title} <span className="text-brand">{accentTitle}</span>
        </span>
        <span id={describedBy} className="text-xs text-muted">
          PDF, PNG or JPG · Max {maxMb}MB · Multi-page supported
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          handleFiles(event.target.files);
          // Allow re-selecting the same file after a removal.
          event.target.value = "";
        }}
      />
    </div>
  );
}
