"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CheckCheck,
  FileText,
  PenLine,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { FileDropZone } from "./FileDropZone";
import { SelectedFileCard } from "./SelectedFileCard";
import { StudentFileList } from "./StudentFileList";
import { SetupGuide, type SetupState } from "./SetupGuide";

/**
 * The four badges orbiting the hero portrait, at the positions the Figma
 * places them. Each one names a stage of the run, so the ring previews the
 * work rather than decorating the page.
 */
const HERO_BADGES = [
  { Icon: FileText, left: "70.4%", top: "11.9%", label: "Question paper" },
  { Icon: PenLine, left: "10.7%", top: "41.9%", label: "Handwriting" },
  { Icon: CheckCheck, left: "93.7%", top: "70.5%", label: "Answer mapping" },
  { Icon: BarChart3, left: "35.1%", top: "96.7%", label: "Marks" },
] as const;

type Slot = "questionPaper";

const ACCEPTED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg"];

function validate(file: File, maxMb: number): string | null {
  const lower = file.name.toLowerCase();
  const extensionOk = ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
  if (!extensionOk) {
    return `"${file.name}" is not a supported format. Upload a PDF, PNG or JPG.`;
  }
  if (file.size === 0) {
    return `"${file.name}" is empty. Choose a different file.`;
  }
  if (file.size > maxMb * 1024 * 1024) {
    return `"${file.name}" is larger than the ${maxMb}MB limit.`;
  }
  return null;
}

export function UploadScreen({
  maxUploadMb,
  setup,
  onStart,
}: {
  maxUploadMb: number;
  /** Provider state for the setup guide. Never carries the key itself. */
  setup: SetupState;
  onStart: (body: FormData) => void;
}) {
  const [files, setFiles] = useState<Partial<Record<Slot, File>>>({});
  const [sheets, setSheets] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const select = useCallback(
    (slot: Slot, picked: File[]) => {
      const file = picked[0];
      if (!file) return;
      const message = validate(file, maxUploadMb);
      if (message) {
        setError(message);
        return;
      }
      setError(null);
      setFiles((current) => ({ ...current, [slot]: file }));
    },
    [maxUploadMb],
  );

  /** Add a batch of sheets, keeping what is already staged. */
  const addSheets = useCallback(
    (picked: File[]) => {
      const rejected: string[] = [];
      const accepted = picked.filter((file) => {
        const message = validate(file, maxUploadMb);
        if (message) rejected.push(message);
        return !message;
      });

      setSheets((current) => {
        // Re-picking the same file should not duplicate a student.
        const seen = new Set(current.map((f) => `${f.name}:${f.size}`));
        return [
          ...current,
          ...accepted.filter((f) => !seen.has(`${f.name}:${f.size}`)),
        ];
      });
      setError(rejected[0] ?? null);
    },
    [maxUploadMb],
  );

  const removeSheet = useCallback((index: number) => {
    setError(null);
    setSheets((current) => current.filter((_, position) => position !== index));
  }, []);

  const remove = useCallback((slot: Slot) => {
    setError(null);
    setFiles((current) => {
      const next = { ...current };
      delete next[slot];
      return next;
    });
  }, []);

  const ready = Boolean(files.questionPaper) && sheets.length > 0;

  const submit = useCallback(() => {
    if (!files.questionPaper || sheets.length === 0 || submitting) return;

    setSubmitting(true);
    setError(null);

    const body = new FormData();
    body.append("questionPaper", files.questionPaper);
    for (const sheet of sheets) body.append("answerSheets", sheet);
    onStart(body);
  }, [files, sheets, onStart, submitting]);

  return (
    <div className="scrollbar-slim flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center px-5 py-10 sm:py-14">
        <h1 className="text-center text-[26px] leading-tight font-bold tracking-tight text-ink sm:text-[34px]">
          Upload{" "}
          <span className="brand-underline text-brand">
            Question Paper &amp; Answer Sheets
          </span>
        </h1>
        <p className="mt-2 text-center text-sm text-ink-soft">
          Upload both files to get started
        </p>

        <span
          aria-hidden
          className="relative mt-7 grid size-[148px] place-items-center rounded-full bg-brand-soft ring-8 ring-brand-soft/40"
        >
          <Image
            src="/avatar/teacher.svg"
            alt=""
            width={86}
            height={86}
            priority
            className="size-[86px] rounded-full bg-surface object-cover"
          />

          {/*
            The badges sit at the Figma's own angles, which are deliberately
            uneven — evenly spacing them at 12/3/6/9 reads as a loading spinner
            rather than as the drawn composition.
          */}
          {HERO_BADGES.map(({ Icon, left, top, label }) => (
            <span
              key={label}
              style={{ left, top }}
              className="absolute grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[8px] bg-brand shadow-[0_2px_6px_rgb(255_90_38_/_0.35)]"
            >
              <Icon className="size-3 text-white" strokeWidth={2.5} />
            </span>
          ))}
        </span>

        <div className="mt-9 grid w-full gap-4 sm:grid-cols-2">
          {files.questionPaper ? (
            <SelectedFileCard
              file={files.questionPaper}
              role="Question paper"
              onRemove={() => remove("questionPaper")}
              disabled={submitting}
            />
          ) : (
            <FileDropZone
              title="Upload"
              accentTitle="Question Paper"
              maxMb={maxUploadMb}
              onSelect={(picked) => select("questionPaper", picked)}
              disabled={submitting}
            />
          )}

          <FileDropZone
            title="Upload"
            accentTitle="Answer Sheets"
            maxMb={maxUploadMb}
            multiple
            hint={
              sheets.length > 0
                ? `${sheets.length} student${sheets.length === 1 ? "" : "s"} staged · add more`
                : `PDF, PNG or JPG · one file per student · select several at once`
            }
            onSelect={addSheets}
            disabled={submitting}
          />
        </div>

        <div className="mt-4 w-full">
          <StudentFileList
            files={sheets}
            onRemove={removeSheet}
            onClear={() => setSheets([])}
            disabled={submitting}
          />
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-5 flex w-full items-start gap-2 rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger-ink"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        ) : null}

        <Button
          size="lg"
          onClick={submit}
          disabled={!ready || submitting}
          className="mt-8 min-w-[190px]"
        >
          {submitting ? (
            <>
              <Spinner /> Starting…
            </>
          ) : (
            <>
              Start Mapping
              {sheets.length > 1 ? ` · ${sheets.length} students` : ""}
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>

        <p className="mt-3 text-center text-xs text-muted">
          {ready
            ? `Ready to evaluate ${sheets.length} student${sheets.length === 1 ? "" : "s"} against this paper.`
            : "Upload a question paper and one answer sheet per student to get started"}
        </p>

        <SetupGuide setup={setup} />

        <Link
          href="/demo"
          className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-brand"
        >
          <Sparkles className="size-3.5" />
          Explore a sample result without uploading
        </Link>
      </div>
    </div>
  );
}
