"use client";

import { useCallback, useState } from "react";
import { Check, Download, FileDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  AssessmentResult,
  ReviewEdits,
  StudentResult,
} from "@/lib/types/assessment";
import { buildEvaluationPdf, reportFileName } from "@/lib/report-pdf";

/**
 * Downloads the evaluation report as a PDF.
 *
 * Generated in the browser from the marks currently in force, so a teacher's
 * edits are in the file without a round-trip — and without posting the whole
 * result, page images included, back to the server to get them.
 */
export function ExportReport({
  result,
  student,
  edits,
}: {
  result: AssessmentResult;
  student: StudentResult;
  edits: ReviewEdits;
}) {
  const [busy, setBusy] = useState<"one" | "all" | null>(null);
  const [done, setDone] = useState<"one" | "all" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = useCallback(
    async (scope: "one" | "all") => {
      setBusy(scope);
      setError(null);
      try {
        const bytes = await buildEvaluationPdf({
          result,
          edits,
          student: scope === "one" ? student : undefined,
        });
        const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = reportFileName(scope === "one" ? student : undefined);
        document.body.appendChild(link);
        link.click();
        link.remove();
        // Revoked on the next tick so the download has taken the handle.
        setTimeout(() => URL.revokeObjectURL(url), 4000);

        setDone(scope);
        setTimeout(() => setDone(null), 2200);
      } catch (cause) {
        console.error("[export] could not build the report", cause);
        setError("The report could not be generated. Please try again.");
      } finally {
        setBusy(null);
      }
    },
    [result, student, edits],
  );

  const multiple = result.students.length > 1;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => download("one")}
        disabled={busy !== null}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-all",
          "disabled:cursor-not-allowed disabled:opacity-60",
          done === "one"
            ? "border-success/30 bg-success-soft text-success-ink"
            : "border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink active:scale-[0.98]",
        )}
      >
        {busy === "one" ? (
          <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : done === "one" ? (
          <Check className="size-3.5" strokeWidth={3} />
        ) : (
          <Download className="size-3.5" />
        )}
        {done === "one" ? "Downloaded" : "Export report"}
      </button>

      {multiple ? (
        <button
          type="button"
          onClick={() => download("all")}
          disabled={busy !== null}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-all",
            "disabled:cursor-not-allowed disabled:opacity-60",
            done === "all"
              ? "border-success/30 bg-success-soft text-success-ink"
              : "border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink active:scale-[0.98]",
          )}
        >
          {busy === "all" ? (
            <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : done === "all" ? (
            <Check className="size-3.5" strokeWidth={3} />
          ) : (
            <FileDown className="size-3.5" />
          )}
          {done === "all" ? "Downloaded" : `All ${result.students.length}`}
        </button>
      ) : null}

      {error ? (
        <span role="alert" className="text-[11px] font-medium text-danger-ink">
          {error}
        </span>
      ) : null}
    </div>
  );
}
