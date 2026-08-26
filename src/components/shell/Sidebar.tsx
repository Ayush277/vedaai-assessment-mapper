"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  ClipboardList,
  FileText,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { UnavailableButton } from "./UnavailableButton";

/** Icon metrics are shared so every rail item lines up on the same axis. */
const ICON = "size-[18px] shrink-0";

/**
 * Only Exams is part of this build. The rest of the VedaAI navigation is drawn
 * because the design has it, but shown as locked rather than as links that go
 * nowhere.
 */
const NAV = [
  { label: "Home", icon: LayoutGrid },
  { label: "My Classroom", icon: Users },
  { label: "Assignments", icon: FileText },
  { label: "Exams", icon: ClipboardList, href: "/" },
  { label: "My Library", icon: BookOpen },
] as const;

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col rounded-card bg-surface p-3 transition-[width] duration-200 lg:flex",
        collapsed ? "w-[68px]" : "w-[236px]",
      )}
    >
      <div
        className={cn(
          "flex items-center px-1 pt-1 pb-4",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        {collapsed ? null : <Logo />}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          aria-expanded={!collapsed}
          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-panel hover:text-ink"
        >
          {collapsed ? (
            <PanelLeftOpen className={ICON} />
          ) : (
            <PanelLeftClose className={ICON} />
          )}
        </button>
      </div>

      <UnavailableButton
        label="AI Teacher's Toolkit"
        reason="The wider toolkit is outside this assignment"
        showLock={!collapsed}
        dim="soft"
        className={cn(
          "flex items-center justify-center gap-2 rounded-full bg-ink text-white",
          "shadow-[0_0_0_3px_var(--color-brand-ring)]",
          collapsed ? "size-11 self-center" : "h-11 w-full px-4",
        )}
      >
        <Sparkles className="size-4 shrink-0 text-brand" />
        {collapsed ? null : (
          <span className="text-sm font-medium">AI Teacher&apos;s Toolkit</span>
        )}
      </UnavailableButton>

      <nav className="mt-6 flex flex-col gap-0.5" aria-label="Main">
        {NAV.map((item) => {
          const Icon = item.icon;
          const href = "href" in item ? item.href : undefined;

          if (!href) {
            return (
              <UnavailableButton
                key={item.label}
                label={item.label}
                showLock={false}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-soft",
                  collapsed && "justify-center px-0",
                )}
              >
                <Icon className={ICON} strokeWidth={1.8} />
                {collapsed ? null : <span className="truncate">{item.label}</span>}
              </UnavailableButton>
            );
          }

          const active = pathname === href || pathname.startsWith("/results");
          return (
            <Link
              key={item.label}
              href={href}
              aria-current={active ? "page" : undefined}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                collapsed && "justify-center px-0",
                active
                  ? "bg-panel font-medium text-ink"
                  : "text-ink-soft hover:bg-panel/70 hover:text-ink",
              )}
            >
              <Icon className={ICON} strokeWidth={1.8} />
              {collapsed ? null : <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2 pt-4">
        <UnavailableButton
          label="Settings"
          showLock={false}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-soft",
            collapsed && "justify-center px-0",
          )}
        >
          <Settings className={ICON} strokeWidth={1.8} />
          {collapsed ? null : <span>Settings</span>}
        </UnavailableButton>

        <div
          className={cn(
            "flex items-center gap-2.5 rounded-2xl border border-line bg-panel/60 p-2.5",
            collapsed && "justify-center border-0 bg-transparent p-0",
          )}
        >
          <Image
            src="/avatar/ayush.svg"
            alt=""
            width={36}
            height={36}
            className="size-9 shrink-0 rounded-full ring-2 ring-brand-soft"
          />
          {collapsed ? null : (
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-ink">
                Ayush Kumar
              </span>
              <span className="block truncate text-[11px] text-muted">
                Delhi Public School
              </span>
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
