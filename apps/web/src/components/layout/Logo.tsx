import { cn } from "../../lib/utils";

/** Original INFERA mark: an ascending, faceted "I" built from three slabs. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <rect width="32" height="32" rx="8" fill="#0F0B1A" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" stroke="#8B5CF6" strokeOpacity="0.35" />
      <path d="M9 22.5 16 25l7-2.5v-2.2l-7 2.4-7-2.4v2.2Z" fill="#6D3FE0" />
      <path d="M12.6 19.6 16 20.8l3.4-1.2V9.6L16 8.4l-3.4 1.2v10Z" fill="#8B5CF6" />
      <path d="M16 8.4 19.4 9.6 23 7.9 16 5.5 9 7.9l3.6 1.7L16 8.4Z" fill="#C4B5FD" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="leading-none">
        <span className="block text-[15px] font-semibold tracking-[0.18em] text-zinc-50">INFERA</span>
        <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">Control Center</span>
      </span>
    </span>
  );
}
