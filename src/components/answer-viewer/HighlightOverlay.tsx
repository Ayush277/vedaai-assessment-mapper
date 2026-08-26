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
  /** Selecting this region selects the question it belongs to. */
  onSelect?: () => void;
  /** Announced to screen readers and shown as a tooltip. */
  title?: string;
};

const TONES: Record<HighlightTone, { box: string; tag: string; hover: string }> = {
  active: {
    box: "border-highlight bg-highlight-fill",
    tag: "bg-highlight text-white",
    hover: "hover:bg-highlight/25",
  },
  review: {
    box: "border-highlight-review bg-highlight-review-fill",
    tag: "bg-highlight-review text-white",
    hover: "hover:bg-highlight-review/25",
  },
  unmatched: {
    box: "border-brand bg-brand/15",
    tag: "bg-brand text-white",
    hover: "hover:bg-brand/25",
  },
  // Every other detected answer: present but quiet, so the teacher can see
  // where the rest of the answers are and click straight to one.
  muted: {
    box: "border-dashed border-line-strong/70 bg-transparent",
    tag: "bg-ink/60 text-white",
    hover: "hover:border-highlight hover:bg-highlight-fill/60",
  },
};

/**
 * Highlights are positioned purely in percentages of the page box, so they stay
 * pinned to the handwriting through window resizes, zoom changes and layout
 * shifts without any recalculation in JavaScript.
 */
export function HighlightOverlay({ highlight }: { highlight: Highlight }) {
  const tone = TONES[highlight.tone];
  const { bbox, onSelect } = highlight;
  const interactive = Boolean(onSelect);

  const style = {
    left: `${bbox.x * 100}%`,
    top: `${bbox.y * 100}%`,
    width: `${bbox.width * 100}%`,
    height: `${bbox.height * 100}%`,
  } as const;

  const body = (
    <>
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
    </>
  );

  const shared = cn(
    "absolute rounded-[6px] border-2 transition-all duration-200",
    tone.box,
    highlight.tone === "active" && "animate-veda-highlight-in",
  );

  if (!interactive) {
    return (
      <div aria-hidden className={cn(shared, "pointer-events-none")} style={style}>
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      title={highlight.title}
      aria-label={highlight.title ?? "Select this answer"}
      className={cn(shared, tone.hover, "cursor-pointer text-left")}
      style={style}
    >
      {body}
    </button>
  );
}
