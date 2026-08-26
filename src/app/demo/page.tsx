import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { ResultsScreen } from "@/components/results/ResultsScreen";
import { DEMO_RESULT } from "@/lib/demo/sample";

export const metadata: Metadata = {
  title: "Sample result — VedaAI",
  description:
    "A saved run of the VedaAI extraction pipeline, for exploring the interface without uploading files.",
};

export default function DemoPage() {
  return (
    <AppShell breadcrumb="Exams · Sample" backHref="/">
      <div className="flex shrink-0 flex-col items-start gap-2 border-b border-warn/25 bg-warn-soft px-4 py-2.5 sm:flex-row sm:items-center sm:px-5">
        <p className="flex min-w-0 flex-1 items-start gap-2 text-[12px] leading-relaxed text-warn">
          <FlaskConical className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
          <span>
          <strong className="font-semibold">Sample data.</strong> This is a saved
          run of the real pipeline over the bundled fixture papers — no AI credits
          are used to view it. Upload your own files to run a live extraction.
          </span>
        </p>
        <Link
          href="/"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-warn/30 bg-surface px-3 py-1 text-[12px] font-medium text-warn transition-colors hover:bg-warn-soft"
        >
          <ArrowLeft className="size-3.5" />
          Upload real files
        </Link>
      </div>

      <ResultsScreen result={DEMO_RESULT} />
    </AppShell>
  );
}
