"use client";

import { useId, useState } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Chrome that belongs to the wider VedaAI product but is out of scope here.
 *
 * These are kept because removing them would misrepresent the design, but a
 * control that looks live and does nothing is worse than one that says so.
 * Each is disabled, marked with a lock, and explains itself on hover, focus and
 * tap — so nobody clicks and wonders whether the app is broken.
 */
export function UnavailableButton({
  label,
  children,
  className,
  showLock = true,
  /** Keep a filled control legible; dimming a dark button just looks broken. */
  dim = "normal",
  reason = "Not part of this assignment build",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  showLock?: boolean;
  dim?: "normal" | "soft";
  reason?: string;
}) {
  const [open, setOpen] = useState(false);
  const tipId = useId();

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-disabled="true"
        aria-describedby={open ? tipId : undefined}
        onClick={(event) => {
          event.preventDefault();
          setOpen((value) => !value);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={cn(
          "relative cursor-not-allowed transition-opacity",
          dim === "soft"
            ? "opacity-80 hover:opacity-100"
            : "opacity-50 hover:opacity-75",
          className,
        )}
      >
        {children}
        {showLock ? (
          <span className="absolute -right-0.5 -bottom-0.5 grid size-3 place-items-center rounded-full bg-ink text-white">
            <Lock className="size-2" strokeWidth={3} />
          </span>
        ) : null}
      </button>

      {open ? (
        <span
          id={tipId}
          role="tooltip"
          className="pointer-events-none absolute top-full left-1/2 z-50 mt-1.5 w-max max-w-[210px] -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-[11px] leading-snug font-medium text-white shadow-lg"
        >
          <strong className="font-semibold">{label}</strong>
          <span className="mt-0.5 block text-white/70">{reason}</span>
        </span>
      ) : null}
    </span>
  );
}
