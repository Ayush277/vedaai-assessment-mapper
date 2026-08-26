"use client";

import { cn } from "@/lib/utils";
import type { NormalizedBoundingBox } from "@/lib/types/assessment";

export type HighlightTone = "active" | "review" | "unmatched" | "muted";

export type Highlight = {
  id: string;
  pageNumber: number;
  bbox: NormalizedBoundingBox;
  tone: HighlightTone;
  /** Small tag rendered at the top-left corner, e.g. "Q2". */
  label?: string;
  /** Rendered under the tag when the region is part of a multi-page answer. */
  note?: string;
};

const TONES: Record<HighlightTone, { box: string; tag: string }> = {
  active: {
    box: "border-highlight bg-highlight-fill",
    tag: "bg-highlight text-white",
  },
  review: {
    box: "border-highlight-review bg-highlight-review-fill",
    tag: "bg-highlight-review text-white",
  },
  unmatched: {
    box: "border-brand bg-brand/15",
    tag: "bg-brand text-white",
  },
  muted: {
    box: "border-highlight/50 bg-highlight-fill/40 border-dashed",
    tag: "bg-highlight/70 text-white",
  },
};

/**
 * Highlights are positioned purely in percentages of the page box, so they stay
 * pinned to the handwriting through window resizes, zoom changes and layout
 * shifts without any recalculation in JavaScript.
 */
export function HighlightOverlay({ highlight }: { highlight: Highlight }) {
  const tone = TONES[highlight.tone];
  const { bbox } = highlight;

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute rounded-[6px] border-2 transition-[opacity] duration-200",
        tone.box,
      )}
      style={{
        left: `${bbox.x * 100}%`,
        top: `${bbox.y * 100}%`,
        width: `${bbox.width * 100}%`,
        height: `${bbox.height * 100}%`,
      }}
    >
      {highlight.label ? (
        <span
          className={cn(
            "absolute -top-px -left-px rounded-tl-[4px] rounded-br-[6px] px-1.5 py-0.5",
            "text-[10px] leading-none font-bold whitespace-nowrap",
            tone.tag,
          )}
        >
          {highlight.label}
        </span>
      ) : null}
      {highlight.note ? (
        <span
          className={cn(
            "absolute -right-px -bottom-px rounded-tl-[6px] rounded-br-[4px] px-1.5 py-0.5",
            "text-[10px] leading-none font-semibold whitespace-nowrap",
            tone.tag,
          )}
        >
          {highlight.note}
        </span>
      ) : null}
    </div>
  );
}
