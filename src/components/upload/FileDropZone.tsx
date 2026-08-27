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
  multiple = false,
  hint,
}: {
  title: string;
  accentTitle: string;
  maxMb: number;
  onSelect: (files: File[]) => void;
  disabled?: boolean;
  /** Answer sheets arrive a class at a time; the question paper does not. */
  multiple?: boolean;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const describedBy = useId();

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const picked = Array.from(files ?? []);
      if (picked.length > 0) onSelect(multiple ? picked : picked.slice(0, 1));
    },
    [onSelect, multiple],
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
        "group rounded-card border-2 border-dashed bg-surface transition-all",
        dragging
          ? "border-brand bg-brand-soft/40"
          : "border-line-strong hover:border-brand/60 hover:bg-brand-soft/20",
        disabled ? "opacity-60" : "cursor-pointer",
      )}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        aria-describedby={describedBy}
        className="flex w-full cursor-pointer flex-col items-center gap-3 px-6 py-10 text-center disabled:cursor-not-allowed"
      >
        <span className="grid size-11 place-items-center rounded-xl border border-line bg-panel text-ink-soft transition-colors group-hover:border-brand/30 group-hover:bg-brand-soft group-hover:text-brand">
          <Upload className="size-5" strokeWidth={1.8} />
        </span>
        <span className="text-[15px] font-semibold text-ink">
          {title} <span className="text-brand">{accentTitle}</span>
        </span>
        <span id={describedBy} className="text-xs text-muted">
          {hint ?? `PDF, PNG or JPG · Max ${maxMb}MB · Multi-page supported`}
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple={multiple}
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
