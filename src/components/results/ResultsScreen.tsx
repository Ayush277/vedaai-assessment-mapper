"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronsDownUp,
  ChevronsUpDown,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnswerRegion, AssessmentResult } from "@/lib/types/assessment";
import {
  buildQuestionRows,
  filterRows,
  searchRows,
  unmatchedAnswers,
  type FilterKey,
  type QuestionRow,
} from "@/lib/view-model";
import {
  AnswerSheetViewer,
  type AnswerSheetViewerHandle,
} from "@/components/answer-viewer/AnswerSheetViewer";
import type { Highlight } from "@/components/answer-viewer/HighlightOverlay";
import { QuestionCard } from "./QuestionCard";
import { SummaryStrip } from "./SummaryStrip";
import { GradingSummary } from "./GradingSummary";
import { UnmatchedPanel } from "./UnmatchedPanel";
import { FilterTabs } from "./FilterTabs";
import { DegradationNotice } from "./DegradationNotice";

type Selection =
  | { kind: "question"; questionId: string }
  | { kind: "answer"; answerId: string }
  | null;

export function ResultsScreen({
  result,
  onStartOver,
}: {
  result: AssessmentResult;
  onStartOver?: () => void;
}) {
  const rows = useMemo(() => buildQuestionRows(result), [result]);
  const stray = useMemo(() => unmatchedAnswers(result), [result]);

  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Selection>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [mobileTab, setMobileTab] = useState<"questions" | "sheet">("questions");
  const viewerRef = useRef<AnswerSheetViewerHandle>(null);

  /** Scroll the sheet to an answer's first region. */
  const focusAnswer = useCallback((answer?: { regions: AnswerRegion[] }) => {
    const first = answer?.regions[0];
    if (first) viewerRef.current?.focusRegion(first.pageNumber, first.bbox.y);
  }, []);

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

  /* --------------------------- Selection plumbing --------------------------- */

  const selectQuestion = useCallback(
    (row: QuestionRow) => {
      setSelection({ kind: "question", questionId: row.question.id });
      setExpanded((current) => new Set(current).add(row.question.id));
      setMobileTab("sheet");
      focusAnswer(row.answer);
    },
    [focusAnswer],
  );

  const selectStrayAnswer = useCallback(
    (answerId: string) => {
      const answer = stray.find((entry) => entry.id === answerId);
      setSelection({ kind: "answer", answerId });
      setMobileTab("sheet");
      focusAnswer(answer);
    },
    [stray, focusAnswer],
  );

  /** Answer sheet -> question list: clicking a region selects its question. */
  const selectByAnswerId = useCallback(
    (answerId: string) => {
      const row = rows.find((entry) => entry.answer?.id === answerId);
      if (row) {
        selectQuestion(row);
        setMobileTab("questions");
        document
          .getElementById(`question-card-${row.question.id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (stray.some((answer) => answer.id === answerId)) selectStrayAnswer(answerId);
    },
    [rows, stray, selectQuestion, selectStrayAnswer],
  );

  const clearSelection = useCallback(() => setSelection(null), []);

  /* ---------------------------- Highlight model ---------------------------- */

  const highlights = useMemo<Highlight[]>(() => {
    const active = selectedRow?.answer ?? selectedStray;
    const list: Highlight[] = [];

    // Every other detected answer stays visible as a quiet, clickable outline,
    // so the sheet reads as a map of the whole booklet rather than one box.
    for (const row of rows) {
      if (!row.answer || row.answer.id === active?.id) continue;
      row.answer.regions.forEach((region, index) => {
        list.push({
          id: `muted-${row.answer!.id}-${index}`,
          pageNumber: region.pageNumber,
          bbox: region.bbox,
          tone: "muted",
          onSelect: () => selectByAnswerId(row.answer!.id),
          title: `Answer to question ${row.question.label.replace(/[.:]$/, "")}`,
        });
      });
    }

    if (!active) return list;

    const isReview =
      selection?.kind === "question" && selectedRow?.mapping.status === "needs_review";
    const tone = selectedStray ? "unmatched" : isReview ? "review" : "active";
    const label = selectedRow
      ? selectedRow.question.label.replace(/[.:]$/, "")
      : "Unmatched";
    const pages = [...new Set(active.regions.map((region) => region.pageNumber))].sort(
      (a, b) => a - b,
    );

    active.regions.forEach((region, index) => {
      list.push({
        id: `active-${active.id}-${index}`,
        pageNumber: region.pageNumber,
        bbox: region.bbox,
        tone,
        label:
          active.regions.findIndex((e) => e.pageNumber === region.pageNumber) === index
            ? label
            : undefined,
        note:
          pages.length > 1 && index === active.regions.length - 1
            ? `continues · pages ${pages.join(", ")}`
            : undefined,
      });
    });

    return list;
  }, [rows, selectedRow, selectedStray, selection, selectByAnswerId]);

  /* ------------------------- Keyboard list navigation ----------------------- */

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key === "Escape") {
        clearSelection();
        return;
      }
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
  }, [visible, selectedRow, selectQuestion, clearSelection]);

  const allExpanded = expanded.size >= rows.length && rows.length > 0;

  /* -------------------------------- Render -------------------------------- */

  const questionPanel = (
    <div className="scrollbar-slim flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
      <div className="flex flex-col gap-3 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-[15px] font-semibold text-ink">
            Extracted Questions{" "}
            <span className="font-normal text-muted">(from question paper)</span>
          </h2>
          {onStartOver ? (
            <button
              type="button"
              onClick={onStartOver}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
            >
              <RotateCcw className="size-3.5" />
              New assessment
            </button>
          ) : null}
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
        <GradingSummary result={result} rows={rows} />
        <DegradationNotice degradations={result.degradations ?? []} />

        {result.provider.degraded ? (
          <p className="flex items-start gap-2 rounded-card border border-warn/25 bg-warn-soft px-3 py-2.5 text-[11px] leading-relaxed text-warn">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              <strong className="font-semibold">Read with local OCR.</strong>{" "}
              {result.provider.localMode === "chosen"
                ? "This run was set to use local Tesseract OCR rather than an AI provider."
                : "No AI provider was configured for this run, so handwriting was read by Tesseract."}{" "}
              Question extraction is reliable; handwritten answers and their matches
              should be checked before you rely on them.
            </span>
          </p>
        ) : null}

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

      </div>

      <div className="sticky top-0 z-10 -mx-1 mb-3 flex flex-wrap items-center gap-2 bg-panel px-1 py-2">
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

      <div className="mb-3">
        <UnmatchedPanel
          answers={stray}
          selectedId={selection?.kind === "answer" ? selection.answerId : null}
          onSelect={selectStrayAnswer}
        />
      </div>

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
        <ul className="space-y-2 pb-2">
          {visible.map((row) => (
            <QuestionCard
              key={row.question.id}
              row={row}
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
        ref={viewerRef}
        pages={result.answerSheet.pages}
        highlights={highlights}
      />
      <SelectionNote
        selectedRow={selectedRow}
        strayLabel={selectedStray?.recognizedLabel}
        hasStray={Boolean(selectedStray)}
        hasSelection={Boolean(selection)}
        onClear={clearSelection}
      />
    </div>
  );

  return (
    <div className="animate-veda-fade-up flex min-h-0 flex-1 flex-col">
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
  onClear,
}: {
  selectedRow?: QuestionRow;
  strayLabel?: string;
  hasStray: boolean;
  hasSelection: boolean;
  onClear: () => void;
}) {
  const base =
    "flex shrink-0 items-start gap-2 border-t border-line px-4 py-3 text-[12px] sm:px-5";

  if (!hasSelection) {
    return (
      <p className={cn(base, "justify-center text-center text-muted")}>
        Select a question to jump to the student&apos;s answer and highlight it here.
        Faint outlines mark every other detected answer — click one to open its question.
      </p>
    );
  }

  const clearButton = (
    <button
      type="button"
      onClick={onClear}
      className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-soft transition-colors hover:bg-panel"
    >
      <X className="size-3" strokeWidth={2.5} />
      Clear
    </button>
  );

  if (hasStray) {
    return (
      <p className={cn(base, "bg-brand-soft/40 text-ink-soft")}>
        <span>
          <strong className="font-semibold text-ink">Unmatched answer.</strong> This
          handwritten region
          {strayLabel ? ` is labelled "${strayLabel}" but` : ""} could not be confidently
          linked to any question on the paper.
        </span>
        {clearButton}
      </p>
    );
  }

  if (selectedRow && !selectedRow.answer) {
    return (
      <p className={cn(base, "bg-danger-soft/50 text-ink-soft")}>
        <span>
          <strong className="font-semibold text-ink">No answer found.</strong> Question{" "}
          {selectedRow.question.label.replace(/[.:]$/, "")} appears to be unanswered, so
          there is nothing to highlight.
        </span>
        {clearButton}
      </p>
    );
  }

  if (selectedRow?.mapping.status === "needs_review") {
    return (
      <p className={cn(base, "bg-warn-soft text-warn")}>
        <span>
          <strong className="font-semibold">Needs review.</strong>{" "}
          {selectedRow.mapping.reasons[0]}
        </span>
        {clearButton}
      </p>
    );
  }

  if (selectedRow?.isMultiPage) {
    return (
      <p className={cn(base, "text-ink-soft")}>
        <span>
          This answer continues across pages {selectedRow.pages.join(", ")}. All regions
          are highlighted — scroll to follow it.
        </span>
        {clearButton}
      </p>
    );
  }

  return (
    <p className={cn(base, "text-muted")}>
      <span>Highlighted region shows exactly where this answer was written.</span>
      {clearButton}
    </p>
  );
}
