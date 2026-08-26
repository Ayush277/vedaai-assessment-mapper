"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Bell, ClipboardList, HelpCircle, Sparkles } from "lucide-react";
import { UnavailableButton } from "./UnavailableButton";

const ICON = "size-[18px]";

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
          className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel hover:text-ink"
        >
          <ArrowLeft className={ICON} strokeWidth={1.8} />
        </Link>
      ) : (
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-full text-line-strong"
        >
          <ArrowLeft className={ICON} strokeWidth={1.8} />
        </span>
      )}

      <span className="flex min-w-0 items-center gap-2 rounded-full px-2 py-1 text-sm font-medium text-ink">
        <ClipboardList className="size-4 shrink-0 text-muted" strokeWidth={1.8} />
        <span className="truncate">{breadcrumb}</span>
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <UnavailableButton
          label="Help centre"
          className="grid size-9 place-items-center rounded-full text-muted"
        >
          <HelpCircle className={ICON} strokeWidth={1.8} />
        </UnavailableButton>

        <UnavailableButton
          label="Notifications"
          className="grid size-9 place-items-center rounded-full text-muted"
        >
          <Bell className={ICON} strokeWidth={1.8} />
          <span className="absolute top-2 right-2.5 size-1.5 rounded-full bg-brand" />
        </UnavailableButton>

        <UnavailableButton
          label="AI assistant"
          className="grid size-9 place-items-center rounded-full text-muted"
        >
          <Sparkles className={ICON} strokeWidth={1.8} />
        </UnavailableButton>

        <span className="ml-1 flex items-center gap-2 rounded-full py-1 pr-2 pl-1">
          <Image
            src="/avatar/ayush.svg"
            alt=""
            width={32}
            height={32}
            priority
            className="size-8 shrink-0 rounded-full ring-2 ring-brand-soft"
          />
          <span className="hidden text-sm font-medium whitespace-nowrap text-ink sm:inline">
            Ayush Kumar
          </span>
        </span>
      </div>
    </header>
  );
}
