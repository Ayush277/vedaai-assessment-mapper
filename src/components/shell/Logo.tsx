import { cn } from "@/lib/utils";

/**
 * The VedaAI mark, redrawn from the Figma: a near-black squircle carrying a
 * heavy "V" split down its centre line — the right stroke a shade darker,
 * which is what reads as a fold. The wordmark uses the same extra-bold weight
 * and tight tracking as the design.
 */
export function LogoMark({
  size = 34,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <rect width="40" height="40" rx="12.5" fill="#1B1B1D" />
      <path
        d="M10.5 11.5h6.4L20 22.4l3.1-10.9h6.4L22.8 30h-5.6z"
        fill="#FFFFFF"
      />
      <path d="M20 22.4l3.1-10.9h6.4L22.8 30H20z" fill="#CFD2D8" />
    </svg>
  );
}

export function Logo({
  size = 34,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      <span className="text-[20px] leading-none font-extrabold tracking-[-0.02em] text-ink">
        VedaAI
      </span>
    </span>
  );
}
