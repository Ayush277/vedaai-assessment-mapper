"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minus,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocumentPage } from "@/lib/types/assessment";
import { HighlightOverlay, type Highlight } from "./HighlightOverlay";

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;
const FIT = 1;

export function AnswerSheetViewer({
  pages,
  highlights,
  page,
  onPageChange,
  /** Bumped by the parent whenever a new question is selected. */
  focusToken,
  emptyMessage,
}: {
  pages: DocumentPage[];
  highlights: Highlight[];
  page: number;
  onPageChange: (page: number) => void;
  focusToken?: string;
  emptyMessage?: string;
}) {
  const [zoom, setZoom] = useState<number>(FIT);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const current = useMemo(
    () => pages.find((entry) => entry.pageNumber === page) ?? pages[0],
    [pages, page],
  );

  const pageHighlights = useMemo(
    () => highlights.filter((highlight) => highlight.pageNumber === current?.pageNumber),
    [highlights, current],
  );

  const changeZoom = useCallback((direction: 1 | -1) => {
    setZoom((value) => {
      const index = ZOOM_STEPS.findIndex((step) => step >= value - 0.001);
      const next = Math.min(
        ZOOM_STEPS.length - 1,
        Math.max(0, (index === -1 ? 2 : index) + direction),
      );
      return ZOOM_STEPS[next];
    });
  }, []);

  // Bring the selected answer into view. Runs on selection rather than on every
  // highlight change so the teacher's own scrolling is never hijacked.
  useEffect(() => {
    if (!focusToken) return;
    const container = scrollRef.current;
    const stage = stageRef.current;
    if (!container || !stage) return;

    const target = pageHighlights.find((highlight) => highlight.tone !== "muted");
    if (!target) {
      container.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const stageHeight = stage.getBoundingClientRect().height;
    const centre = (target.bbox.y + target.bbox.height / 2) * stageHeight;
    container.scrollTo({
      top: Math.max(0, centre - container.clientHeight / 2),
      behavior: "smooth",
    });
    // pageHighlights is derived from focusToken's effects; re-running on it
    // directly would fight the user's scrolling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusToken, current?.pageNumber]);

  if (!current) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center text-sm text-muted">
        {emptyMessage ?? "No answer sheet pages are available."}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
        <h2 className="mr-auto text-[15px] font-semibold text-ink">Answer Sheet</h2>

        <div className="flex items-center gap-0.5 rounded-full border border-line bg-surface p-0.5">
          <button
            type="button"
            onClick={() => changeZoom(-1)}
            disabled={zoom <= ZOOM_STEPS[0]}
            aria-label="Zoom out"
            className="grid size-7 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel disabled:text-line-strong"
          >
            <Minus className="size-3.5" />
          </button>
          <span className="min-w-[52px] text-center text-xs font-semibold tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => changeZoom(1)}
            disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
            aria-label="Zoom in"
            className="grid size-7 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel disabled:text-line-strong"
          >
            <Plus className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(FIT)}
            aria-label="Fit to page"
            title="Fit to page"
            className="grid size-7 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel"
          >
            <Maximize2 className="size-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-0.5 rounded-full border border-line bg-surface p-0.5">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, current.pageNumber - 1))}
            disabled={current.pageNumber <= pages[0].pageNumber}
            aria-label="Previous page"
            className="grid size-7 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel disabled:text-line-strong"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="px-1.5 text-xs font-semibold whitespace-nowrap tabular-nums">
            Page {current.pageNumber} of {pages[pages.length - 1].pageNumber}
          </span>
          <button
            type="button"
            onClick={() =>
              onPageChange(
                Math.min(pages[pages.length - 1].pageNumber, current.pageNumber + 1),
              )
            }
            disabled={current.pageNumber >= pages[pages.length - 1].pageNumber}
            aria-label="Next page"
            className="grid size-7 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel disabled:text-line-strong"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="scrollbar-slim min-h-0 flex-1 overflow-auto px-4 pb-4 sm:px-5"
      >
        <div
          ref={stageRef}
          className="relative mx-auto overflow-hidden rounded-xl border border-line bg-surface shadow-sm"
          style={{
            width: `${zoom * 100}%`,
            maxWidth: zoom <= FIT ? "100%" : "none",
          }}
        >
          <Image
            key={current.imageUrl}
            src={current.imageUrl}
            alt={`Answer sheet page ${current.pageNumber}`}
            width={current.width}
            height={current.height}
            unoptimized
            priority
            className="block h-auto w-full select-none"
          />
          {pageHighlights.map((highlight) => (
            <HighlightOverlay key={highlight.id} highlight={highlight} />
          ))}
        </div>
      </div>

      {pages.length > 1 ? (
        <div className="scrollbar-slim flex shrink-0 items-center gap-1.5 overflow-x-auto border-t border-line px-4 py-2 sm:px-5">
          {pages.map((entry) => {
            const hasHighlight = highlights.some(
              (highlight) =>
                highlight.pageNumber === entry.pageNumber && highlight.tone !== "muted",
            );
            const isCurrent = entry.pageNumber === current.pageNumber;
            return (
              <button
                key={entry.pageNumber}
                type="button"
                onClick={() => onPageChange(entry.pageNumber)}
                aria-current={isCurrent ? "true" : undefined}
                className={cn(
                  "relative h-7 min-w-7 shrink-0 rounded-lg px-2 text-xs font-semibold transition-colors",
                  isCurrent
                    ? "bg-ink text-white"
                    : "border border-line bg-surface text-ink-soft hover:border-line-strong",
                )}
              >
                {entry.pageNumber}
                {hasHighlight && !isCurrent ? (
                  <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-highlight" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
