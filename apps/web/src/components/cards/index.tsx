import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn, formatCompact } from "../../lib/utils";
import { Skeleton } from "../ui/states";

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-3.5">
        {Icon ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-ink-600 bg-ink-800 text-accent-soft">
            <Icon className="h-[18px] w-[18px]" />
          </div>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-50">{title}</h1>
          {description ? <p className="mt-1 max-w-2xl text-13 leading-relaxed text-zinc-500">{description}</p> : null}
          {meta ? <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-zinc-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  hint,
  loading,
  unavailable,
  tone = "neutral",
  compact,
}: {
  label: string;
  value: number | string | null | undefined;
  icon?: LucideIcon;
  hint?: ReactNode;
  loading?: boolean;
  /** Shown instead of a number when the backend has no data (never fake zero). */
  unavailable?: string;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
  compact?: boolean;
}) {
  return (
    <div className={cn("card", compact ? "p-3.5" : "p-4")}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-zinc-500">{label}</p>
        {Icon ? (
          <Icon
            className={cn(
              "h-3.5 w-3.5",
              tone === "accent" && "text-accent-soft",
              tone === "success" && "text-emerald-400",
              tone === "warning" && "text-amber-400",
              tone === "danger" && "text-red-400",
              tone === "neutral" && "text-zinc-600",
            )}
          />
        ) : null}
      </div>
      {loading ? (
        <Skeleton className="mt-2.5 h-7 w-20" />
      ) : unavailable ? (
        <p className="mt-2 text-13 text-zinc-600">{unavailable}</p>
      ) : (
        <p className={cn("mt-1.5 font-semibold tabular-nums tracking-tight text-zinc-50", compact ? "text-lg" : "text-2xl")}>
          {typeof value === "number" ? formatCompact(value) : value ?? "—"}
        </p>
      )}
      {hint ? <p className="mt-1 text-2xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4", className)}>{children}</div>;
}
