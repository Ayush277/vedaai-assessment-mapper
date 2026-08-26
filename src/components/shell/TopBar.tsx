"use client";

import Link from "next/link";
import { ArrowLeft, Bell, ClipboardList, HelpCircle, Sparkles } from "lucide-react";

export function TopBar({
  breadcrumb = "Exams",
  backHref,
}: {
  breadcrumb?: string;
  backHref?: string;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-4 sm:px-6">
      {backHref ? (
        <Link
          href={backHref}
          aria-label="Back to upload"
          className="grid size-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel hover:text-ink"
        >
          <ArrowLeft className="size-[18px]" />
        </Link>
      ) : (
        <span className="grid size-9 place-items-center rounded-full text-line-strong">
          <ArrowLeft className="size-[18px]" />
        </span>
      )}

      <span className="flex items-center gap-2 rounded-full px-2 py-1 text-sm font-medium text-ink">
        <ClipboardList className="size-4 text-muted" strokeWidth={1.8} />
        {breadcrumb}
      </span>

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          aria-label="Help"
          className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-panel hover:text-ink"
        >
          <HelpCircle className="size-[18px]" strokeWidth={1.8} />
        </button>
        <button
          type="button"
          aria-label="Notifications"
          className="relative grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-panel hover:text-ink"
        >
          <Bell className="size-[18px]" strokeWidth={1.8} />
          <span className="absolute top-2 right-2.5 size-1.5 rounded-full bg-brand" />
        </button>
        <button
          type="button"
          aria-label="AI assistant"
          className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-panel hover:text-ink"
        >
          <Sparkles className="size-[18px]" strokeWidth={1.8} />
        </button>

        <span className="ml-1 flex items-center gap-2 rounded-full py-1 pr-2 pl-1">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-[12px] font-semibold text-brand">
            MR
          </span>
          <span className="hidden text-sm font-medium text-ink sm:inline">
            Madhur Rastogi
          </span>
        </span>
      </div>
    </header>
  );
}
