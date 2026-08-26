"use client";

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

const NAV = [
  { label: "Home", icon: LayoutGrid },
  { label: "My Classroom", icon: Users },
  { label: "Assignments", icon: FileText },
  { label: "Exams", icon: ClipboardList, active: true },
  { label: "My Library", icon: BookOpen },
] as const;

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
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
            <PanelLeftOpen className="size-[18px]" />
          ) : (
            <PanelLeftClose className="size-[18px]" />
          )}
        </button>
      </div>

      <button
        type="button"
        className={cn(
          "relative flex items-center justify-center gap-2 rounded-full bg-ink text-white",
          "shadow-[0_0_0_3px_var(--color-brand-ring)] transition-transform hover:scale-[1.01]",
          collapsed ? "size-11 self-center" : "h-11 w-full px-4",
        )}
      >
        <Sparkles className="size-4 text-brand" />
        {collapsed ? null : (
          <span className="text-sm font-medium">AI Teacher&apos;s Toolkit</span>
        )}
      </button>

      <nav className="mt-6 flex flex-col gap-0.5" aria-label="Main">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = "active" in item && item.active;
          return (
            <a
              key={item.label}
              href="#"
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
              <Icon className="size-[18px] shrink-0" strokeWidth={1.8} />
              {collapsed ? null : <span className="truncate">{item.label}</span>}
            </a>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2 pt-4">
        <a
          href="#"
          title={collapsed ? "Settings" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-soft transition-colors hover:bg-panel/70 hover:text-ink",
            collapsed && "justify-center px-0",
          )}
        >
          <Settings className="size-[18px] shrink-0" strokeWidth={1.8} />
          {collapsed ? null : <span>Settings</span>}
        </a>

        <div
          className={cn(
            "flex items-center gap-2.5 rounded-2xl border border-line bg-panel/60 p-2.5",
            collapsed && "justify-center border-0 bg-transparent p-0",
          )}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-success-soft text-[13px] font-semibold text-success-ink">
            DP
          </span>
          {collapsed ? null : (
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-ink">
                Delhi Public School
              </span>
              <span className="block truncate text-[11px] text-muted">
                Bokaro Steel City
              </span>
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
