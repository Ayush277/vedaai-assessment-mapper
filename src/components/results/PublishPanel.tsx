"use client";

import { useState } from "react";
import { Check, Send, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  PublishRecord,
  ReviewEdits,
  StudentResult,
} from "@/lib/types/assessment";
import { hasAnyEdits } from "@/lib/view-model";

/**
 * Publishing the reviewed results.
 *
 * What gets published is the teacher's final view — the AI's marks with every
 * edit applied on top — not the original AI output. Any further edit clears the
 * published state, so the panel can never claim to have published something the
 * teacher has since changed.
 *
 * There is no results portal in this build, so publishing records the decision
 * and reports what it covered rather than pretending to deliver anywhere.
 */
export function PublishPanel({
  students,
  edits,
  published,
  onPublish,
}: {
  students: StudentResult[];
  edits: ReviewEdits;
  published: PublishRecord | null;
  onPublish: (record: PublishRecord) => void;
}) {
  const [busy, setBusy] = useState(false);
  const ready = students.filter((student) => !student.error);
  const teacherEdited = hasAnyEdits(edits);

  const publish = async () => {
    setBusy(true);
    // A beat so the state change reads as an action rather than a flicker.
    await new Promise((resolve) => setTimeout(resolve, 450));
    onPublish({
      publishedAt: Date.now(),
      studentIds: ready.map((student) => student.id),
      includesTeacherEdits: teacherEdited,
    });
    setBusy(false);
  };

  return (
    <section
      className={cn(
        "rounded-card border px-3 py-2.5 transition-colors",
        published
          ? "border-success/30 bg-success-soft/50"
          : "border-line bg-surface",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
          {published ? (
            <ShieldCheck className="size-4 text-success" strokeWidth={2.2} />
          ) : (
            <Send className="size-4 text-muted" strokeWidth={2} />
          )}
          Publish results
        </h3>

        <button
          type="button"
          onClick={publish}
          disabled={busy || ready.length === 0}
          className={cn(
            "ml-auto inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-medium transition-all",
            "disabled:cursor-not-allowed disabled:bg-line disabled:text-muted",
            published
              ? "border border-success/30 bg-surface text-success-ink hover:bg-success-soft"
              : "bg-ink text-white hover:bg-black active:scale-[0.98]",
          )}
        >
          {busy ? (
            <>
              <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Publishing…
            </>
          ) : published ? (
            <>
              <Check className="size-3.5" strokeWidth={3} />
              Publish again
            </>
          ) : (
            <>
              <Send className="size-3.5" />
              Publish {ready.length} result{ready.length === 1 ? "" : "s"}
            </>
          )}
        </button>
      </div>

      <p className="mt-1 text-[11px] leading-relaxed text-muted">
        {published ? (
          <span className="animate-veda-swap-in block text-success-ink">
            Published {published.studentIds.length} result
            {published.studentIds.length === 1 ? "" : "s"} at{" "}
            {new Date(published.publishedAt).toLocaleTimeString()}
            {published.includesTeacherEdits
              ? ", using your reviewed marks and feedback."
              : ", using the AI evaluation as-is."}{" "}
            Editing anything below will need a re-publish.
          </span>
        ) : (
          <>
            Publishes the marks and feedback as they stand now —{" "}
            {teacherEdited
              ? "your edits included, in place of the AI's originals."
              : "the AI evaluation, since nothing has been edited yet."}
            {students.length > ready.length
              ? ` ${students.length - ready.length} unreadable sheet(s) are excluded.`
              : ""}
          </>
        )}
      </p>
    </section>
  );
}
