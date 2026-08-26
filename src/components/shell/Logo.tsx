export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2">
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="32" height="32" rx="9" fill="#16181d" />
        <path
          d="M9 10.5h3.6l3.4 8.2 3.4-8.2H23l-5.6 12.4h-2.8L9 10.5Z"
          fill="#fff"
        />
        <circle cx="23.2" cy="9.6" r="2.2" fill="#ff5a26" />
      </svg>
      <span className="text-[17px] font-semibold tracking-tight text-ink">
        VedaAI
      </span>
    </span>
  );
}
