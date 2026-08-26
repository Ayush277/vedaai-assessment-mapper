"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronsDownUp, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AssessmentResult } from "@/lib/types/assessment";
import {
  buildQuestionRows,
  filterRows,
  searchRows,
  unmatchedAnswers,
  type FilterKey,
  type QuestionRow,
} from "@/lib/view-model";
import { AnswerSheetViewer } from "@/components/answer-viewer/AnswerSheetViewer";
import type { Highlight } from "@/components/answer-viewer/HighlightOverlay";
import { QuestionCard } from "./QuestionCard";
import { SummaryStrip } from "./SummaryStrip";
import { UnmatchedPanel } from "./UnmatchedPanel";
import { FilterTabs } from "./FilterTabs";
import { DegradationNotice } from "./DegradationNotice";

type Selection =
  | { kind: "question"; questionId: string }
  | { kind: "answer"; answerId: string }
  | null;

export function ResultsScreen({ result }: { result: AssessmentResult }) {
  const rows = useMemo(() => buildQuestionRows(result), [result]);
  const stray = useMemo(() => unmatchedAnswers(result), [result]);

  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Selection>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(result.answerSheet.pages[0]?.pageNumber ?? 1);
  const [mobileTab, setMobileTab] = useState<"questions" | "sheet">("questions");

  const visible = useMemo(
    () => searchRows(filterRows(rows, filter), query),
    [rows, filter, query],
  );

  const counts = useMemo<Record<FilterKey, number>>(
    () => ({
      all: rows.length,
      answered: rows.filter((row) => row.mapping.status === "matched").length,
      unanswered: rows.filter((row) => row.mapping.status === "unanswered").length,
      review: rows.filter((row) => row.mapping.status === "needs_review").length,
    }),
    [rows],
  );

  const selectedRow: QuestionRow | undefined = useMemo(
    () =>
      selection?.kind === "question"
        ? rows.find((row) => row.question.id === selection.questionId)
        : undefined,
    [rows, selection],
  );

  const selectedStray = useMemo(
    () =>
      selection?.kind === "answer"
        ? stray.find((answer) => answer.id === selection.answerId)
        : undefined,
    [stray, selection],
  );

  /* --------------------------- Highlight model --------------------------- */

  const highlights = useMemo<Highlight[]>(() => {
    const active = selectedRow?.answer ?? selectedStray;
    if (!active) return [];

    const isReview =
      selection?.kind === "question" && selectedRow?.mapping.status === "needs_review";
    const tone = selectedStray ? "unmatched" : isReview ? "review" : "active";
    const label = selectedRow
      ? selectedRow.question.label.replace(/[.:]$/, "")
      : "Unmatched";
    const pages = [...new Set(active.regions.map((region) => region.pageNumber))].sort(
      (a, b) => a - b,
    );

    return active.regions.map((region, index) => ({
      id: `${active.id}-${index}`,
      pageNumber: region.pageNumber,
      bbox: region.bbox,
      tone,
      // Only the first region on each page carries the tag, so a multi-block
      // answer does not repeat the same badge down the page.
      label:
        active.regions.findIndex((entry) => entry.pageNumber === region.pageNumber) ===
        index
          ? label
          : undefined,
      note:
        pages.length > 1 && index === active.regions.length - 1
          ? `continues · pages ${pages.join(", ")}`
          : undefined,
    }));
  }, [selectedRow, selectedStray, selection]);

  const focusToken = useMemo(() => {
    if (selection?.kind === "question") return `q:${selection.questionId}:${page}`;
    if (selection?.kind === "answer") return `a:${selection.answerId}:${page}`;
    return undefined;
  }, [selection, page]);

  /* ------------------------------ Selection ------------------------------ */

  const selectQuestion = useCallback(
    (row: QuestionRow) => {
      setSelection({ kind: "question", questionId: row.question.id });
      setExpanded((current) => new Set(current).add(row.question.id));
      if (row.pages.length > 0) setPage(row.pages[0]);
      setMobileTab("sheet");
    },
    [],
  );

  const selectStrayAnswer = useCallback(
    (answerId: string) => {
      const answer = stray.find((entry) => entry.id === answerId);
      setSelection({ kind: "answer", answerId });
      if (answer && answer.regions.length > 0) setPage(answer.regions[0].pageNumber);
      setMobileTab("sheet");
    },
    [stray],
  );

  // Keyboard navigation through the question list.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (visible.length === 0) return;

      const currentIndex = visible.findIndex(
        (row) => row.question.id === selectedRow?.question.id,
      );
      const nextIndex =
        event.key === "ArrowDown"
          ? Math.min(visible.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex === -1 ? 0 : currentIndex - 1);
      event.preventDefault();
      selectQuestion(visible[nextIndex]);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, selectedRow, selectQuestion]);

  const allExpanded = expanded.size >= rows.length && rows.length > 0;

  /* -------------------------------- Render ------------------------------- */

  const questionPanel = (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-[15px] font-semibold text-ink">
          Extracted Questions{" "}
          <span className="font-normal text-muted">(from question paper)</span>
        </h2>
        <button
          type="button"
          onClick={() =>
            setExpanded(
              allExpanded ? new Set() : new Set(rows.map((row) => row.question.id)),
            )
          }
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
        >
          {allExpanded ? (
            <ChevronsDownUp className="size-3.5" />
          ) : (
            <ChevronsUpDown className="size-3.5" />
          )}
          {allExpanded ? "Collapse all" : "Expand All"}
        </button>
      </div>

      <SummaryStrip result={result} />

      {result.provider.degraded ? (
        <p className="flex items-start gap-2 rounded-card border border-warn/25 bg-warn-soft px-3 py-2.5 text-[11px] leading-relaxed text-warn">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <strong className="font-semibold">Read with local OCR.</strong>{" "}
            {result.provider.localMode === "chosen"
              ? "This run was set to use local Tesseract OCR rather than an AI provider."
              : "No AI provider was configured for this run, so handwriting was read by Tesseract."}{" "}
            Question extraction is reliable; handwritten answers and their
            matches should be checked before you rely on them.
          </span>
        </p>
      ) : null}

      <DegradationNotice degradations={result.degradations ?? []} />

      {result.warnings.length > 0 ? (
        <details className="rounded-card border border-warn/25 bg-warn-soft px-3 py-2.5">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12px] font-semibold text-warn">
            <AlertTriangle className="size-3.5" />
            {result.warnings.length} processing note
            {result.warnings.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 space-y-1 pl-5 text-[11px] leading-relaxed text-warn">
            {result.warnings.map((warning) => (
              <li key={warning} className="list-disc">
                {warning}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <FilterTabs value={filter} counts={counts} onChange={setFilter} />
        <label className="relative min-w-[150px] flex-1">
          <span className="sr-only">Search questions and answers</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search questions or answers…"
            className="h-9 w-full rounded-full border border-line bg-surface pr-3 pl-8.5 text-[13px] text-ink placeholder:text-muted"
          />
        </label>
      </div>

      <UnmatchedPanel
        answers={stray}
        selectedId={selection?.kind === "answer" ? selection.answerId : null}
        onSelect={selectStrayAnswer}
      />

      {visible.length === 0 ? (
        <div className="rounded-card border border-dashed border-line-strong bg-surface p-8 text-center">
          <p className="text-sm font-semibold text-ink">No questions match</p>
          <p className="mt-1 text-xs text-muted">
            {query
              ? "Try a different search term."
              : "Switch to another filter to see the rest of the paper."}
          </p>
        </div>
      ) : (
        <ul className="scrollbar-slim min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 pb-2">
          {visible.map((row) => (
            <QuestionCard
              key={row.question.id}
              row={row}
              index={row.question.order}
              selected={selectedRow?.question.id === row.question.id}
              expanded={expanded.has(row.question.id)}
              onSelect={() => selectQuestion(row)}
              onToggleExpand={() =>
                setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(row.question.id)) next.delete(row.question.id);
                  else next.add(row.question.id);
                  return next;
                })
              }
            />
          ))}
        </ul>
      )}
    </div>
  );

  const viewerPanel = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-card border border-line bg-surface">
      <AnswerSheetViewer
        pages={result.answerSheet.pages}
        highlights={highlights}
        page={page}
        onPageChange={setPage}
        focusToken={focusToken}
      />
      <SelectionNote
        selectedRow={selectedRow}
        strayLabel={selectedStray?.recognizedLabel}
        hasStray={Boolean(selectedStray)}
        hasSelection={Boolean(selection)}
      />
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Tab switcher below the desktop breakpoint, matching the Figma mobile flow. */}
      <div className="flex shrink-0 gap-1 border-b border-line bg-surface px-4 py-2 lg:hidden">
        {(["questions", "sheet"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setMobileTab(tab)}
            aria-current={mobileTab === tab}
            className={cn(
              "flex-1 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
              mobileTab === tab ? "bg-ink text-white" : "text-ink-soft hover:bg-panel",
            )}
          >
            {tab === "questions" ? "Questions" : "Answer Sheet"}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-3 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div
          className={cn(
            "flex min-h-0 flex-col",
            mobileTab === "questions" ? "flex" : "hidden lg:flex",
          )}
        >
          {questionPanel}
        </div>
        <div
          className={cn(
            "flex min-h-0 flex-col",
            mobileTab === "sheet" ? "flex" : "hidden lg:flex",
          )}
        >
          {viewerPanel}
        </div>
      </div>
    </div>
  );
}

function SelectionNote({
  selectedRow,
  strayLabel,
  hasStray,
  hasSelection,
}: {
  selectedRow?: QuestionRow;
  strayLabel?: string;
  hasStray: boolean;
  hasSelection: boolean;
}) {
  if (!hasSelection) {
    return (
      <p className="shrink-0 border-t border-line px-4 py-3 text-center text-[12px] text-muted sm:px-5">
        Select a question to jump to the student&apos;s answer and highlight it here.
      </p>
    );
  }

  if (hasStray) {
    return (
      <p className="shrink-0 border-t border-line bg-brand-soft/40 px-4 py-3 text-[12px] text-ink-soft sm:px-5">
        <strong className="font-semibold text-ink">Unmatched answer.</strong> This
        handwritten region
        {strayLabel ? ` is labelled "${strayLabel}" but` : ""} could not be confidently
        linked to any question on the paper.
      </p>
    );
  }

  if (selectedRow && !selectedRow.answer) {
    return (
      <p className="shrink-0 border-t border-line bg-danger-soft/50 px-4 py-3 text-[12px] text-ink-soft sm:px-5">
        <strong className="font-semibold text-ink">No answer found.</strong> Question{" "}
        {selectedRow.question.label.replace(/[.:]$/, "")} appears to be unanswered, so
        there is nothing to highlight.
      </p>
    );
  }

  if (selectedRow?.mapping.status === "needs_review") {
    return (
      <p className="shrink-0 border-t border-line bg-warn-soft px-4 py-3 text-[12px] text-warn sm:px-5">
        <strong className="font-semibold">Needs review.</strong>{" "}
        {selectedRow.mapping.reasons[0]}
      </p>
    );
  }

  if (selectedRow?.isMultiPage) {
    return (
      <p className="shrink-0 border-t border-line px-4 py-3 text-[12px] text-ink-soft sm:px-5">
        This answer continues across pages {selectedRow.pages.join(", ")}. All regions
        are highlighted — use the page buttons to follow it.
      </p>
    );
  }

  return (
    <p className="shrink-0 border-t border-line px-4 py-3 text-[12px] text-muted sm:px-5">
      Highlighted region shows exactly where this answer was written.
    </p>
  );
}
