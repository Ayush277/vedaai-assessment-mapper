"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import {
  ChevronDown,
  ChevronUp,
  Crosshair,
  Maximize2,
  Minus,
  Plus,
} from "lucide-react";
import type { DocumentPage } from "@/lib/types/assessment";
import { HighlightOverlay, type Highlight } from "./HighlightOverlay";

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;
const FIT = 1;
/** Where a scrolled-to region lands vertically: a third down reads best. */
const FOCUS_OFFSET_RATIO = 0.32;

/**
 * Continuous-scroll answer sheet.
 *
 * Every page is rendered stacked in one scroll container rather than swapped in
 * and out, so the teacher scrolls the booklet the way they would flip a real
 * one — and an answer that runs across a page break is visible in one motion.
 * Page numbers are still shown, but as a position readout rather than the only
 * way to move.
 */
export type AnswerSheetViewerHandle = {
  /** Bring a normalized position on a page into view. */
  focusRegion: (pageNumber: number, y: number) => void;
};

export const AnswerSheetViewer = forwardRef<
  AnswerSheetViewerHandle,
  {
    pages: DocumentPage[];
    highlights: Highlight[];
    onVisiblePageChange?: (pageNumber: number) => void;
    emptyMessage?: string;
  }
>(function AnswerSheetViewer(
  { pages, highlights, onVisiblePageChange, emptyMessage },
  ref,
) {
  const [zoom, setZoom] = useState<number>(FIT);
  const [visiblePage, setVisiblePage] = useState(pages[0]?.pageNumber ?? 1);
  const scrollRef = useRef<HTMLDivElement>(null);

  const pageElement = useCallback(
    (pageNumber: number) =>
      scrollRef.current?.querySelector<HTMLElement>(`[data-page="${pageNumber}"]`) ??
      null,
    [],
  );

  const highlightsByPage = useMemo(() => {
    const map = new Map<number, Highlight[]>();
    for (const highlight of highlights) {
      const bucket = map.get(highlight.pageNumber);
      if (bucket) bucket.push(highlight);
      else map.set(highlight.pageNumber, [highlight]);
    }
    return map;
  }, [highlights]);

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

  /** Scroll a normalized position on a given page into view. */
  const scrollToPosition = useCallback(
    (pageNumber: number, y: number, behavior: ScrollBehavior = "smooth") => {
      const container = scrollRef.current;
      const element = pageElement(pageNumber);
      if (!container || !element) return;

      // Measured from rects rather than offsetTop: any transform on an
      // ancestor (the results panel animates in on mount) changes what
      // offsetParent resolves to, which silently shifts offsetTop onto a
      // different origin. Rect deltas are always relative to the viewport, so
      // this stays correct wherever the container sits.
      const containerBox = container.getBoundingClientRect();
      const pageBox = element.getBoundingClientRect();
      const top =
        container.scrollTop +
        (pageBox.top - containerBox.top) +
        y * pageBox.height -
        container.clientHeight * FOCUS_OFFSET_RATIO;

      container.scrollTo({ top: Math.max(0, top), behavior });
    },
    [pageElement],
  );

  /**
   * Scrolling is driven imperatively by the click handler rather than by a
   * derived-state effect. Selecting the question that is already selected
   * produces an identical target, so an effect keyed on that target would not
   * re-run and the sheet would sit still — which is exactly what a teacher
   * clicking the same question again is asking it not to do.
   */
  useImperativeHandle(
    ref,
    () => ({
      focusRegion: (pageNumber: number, y: number) => {
        requestAnimationFrame(() => scrollToPosition(pageNumber, y));
        // A late reflow — a font swapping in, a page image decoding — can move
        // the target after the first scroll is already under way. One quiet
        // correction afterwards costs nothing and removes that whole class of
        // "it scrolled to almost the right place" bug.
        window.setTimeout(() => scrollToPosition(pageNumber, y), 320);
      },
    }),
    [scrollToPosition],
  );

  // Report which page is under the reading line, for the position readout.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const containerBox = container.getBoundingClientRect();
        const line = containerBox.top + containerBox.height * 0.3;
        let current = pages[0]?.pageNumber ?? 1;
        for (const page of pages) {
          const element = pageElement(page.pageNumber);
          if (element && element.getBoundingClientRect().top <= line) {
            current = page.pageNumber;
          }
        }
        setVisiblePage((previous) => {
          if (previous !== current) onVisiblePageChange?.(current);
          return current;
        });
      });
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener("scroll", onScroll);
    };
  }, [pages, onVisiblePageChange, pageElement]);

  const jumpPage = useCallback(
    (direction: 1 | -1) => {
      const index = pages.findIndex((page) => page.pageNumber === visiblePage);
      const next = pages[Math.min(pages.length - 1, Math.max(0, index + direction))];
      if (next) scrollToPosition(next.pageNumber, 0);
    },
    [pages, visiblePage, scrollToPosition],
  );

  const activeHighlight = highlights.find((h) => h.tone !== "muted");

  if (pages.length === 0) {
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

        {activeHighlight ? (
          <button
            type="button"
            onClick={() =>
              scrollToPosition(activeHighlight.pageNumber, activeHighlight.bbox.y)
            }
            className="inline-flex items-center gap-1.5 rounded-full border border-highlight/40 bg-highlight/10 px-2.5 py-1 text-[11px] font-semibold text-success-ink transition-colors hover:bg-highlight/20"
          >
            <Crosshair className="size-3.5" strokeWidth={2.2} />
            Jump to answer
          </button>
        ) : null}

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
          <span className="min-w-[46px] text-center text-xs font-semibold tabular-nums">
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
            aria-label="Fit to width"
            title="Fit to width"
            className="grid size-7 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel"
          >
            <Maximize2 className="size-3.5" />
          </button>
        </div>

        {/* Position readout — the sheet scrolls continuously; these only nudge. */}
        <div className="flex items-center gap-0.5 rounded-full border border-line bg-surface p-0.5">
          <button
            type="button"
            onClick={() => jumpPage(-1)}
            disabled={visiblePage <= pages[0].pageNumber}
            aria-label="Scroll to previous page"
            className="grid size-7 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel disabled:text-line-strong"
          >
            <ChevronUp className="size-4" />
          </button>
          <span className="px-1.5 text-xs font-semibold whitespace-nowrap tabular-nums">
            Page {visiblePage} / {pages[pages.length - 1].pageNumber}
          </span>
          <button
            type="button"
            onClick={() => jumpPage(1)}
            disabled={visiblePage >= pages[pages.length - 1].pageNumber}
            aria-label="Scroll to next page"
            className="grid size-7 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel disabled:text-line-strong"
          >
            <ChevronDown className="size-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        tabIndex={0}
        aria-label="Answer sheet, scrollable"
        className="scrollbar-slim relative min-h-0 flex-1 overflow-y-auto scroll-smooth bg-panel px-4 pb-4 sm:px-5"
      >
        <div
          className="mx-auto flex flex-col gap-3"
          style={{ width: `${zoom * 100}%`, maxWidth: zoom <= FIT ? "100%" : "none" }}
        >
          {pages.map((page) => (
            <div
              key={page.pageNumber}
              data-page={page.pageNumber}
              style={{ aspectRatio: `${page.width} / ${page.height}` }}
              className="relative overflow-hidden rounded-xl border border-line bg-surface shadow-sm"
            >
              <Image
                src={page.imageUrl}
                alt={`Answer sheet page ${page.pageNumber}`}
                width={page.width}
                height={page.height}
                unoptimized
                priority={page.pageNumber <= 2}
                loading={page.pageNumber <= 2 ? undefined : "lazy"}
                className="block h-auto w-full select-none"
              />

              {(highlightsByPage.get(page.pageNumber) ?? []).map((highlight) => (
                <HighlightOverlay key={highlight.id} highlight={highlight} />
              ))}

              <span className="pointer-events-none absolute right-2 bottom-2 rounded-full bg-ink/70 px-2 py-0.5 text-[10px] font-semibold text-white tabular-nums">
                {page.pageNumber}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
