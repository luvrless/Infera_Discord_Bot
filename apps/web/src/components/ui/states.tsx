import { AlertOctagon, Inbox, Lock, PlugZap, RefreshCw, ServerOff, WifiOff, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ApiError, errorMessage, isBotMissing, isForbidden, isUnauthorized } from "../../lib/api/client";
import { cn } from "../../lib/utils";
import { Button } from "./primitives";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading page">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "px-4 py-8" : "px-6 py-14", className)}>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-ink-600 bg-ink-800 text-zinc-500">
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs leading-relaxed text-zinc-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Maps API failures onto the right user-facing state. */
export function ErrorState({
  error,
  onRetry,
  className,
  compact,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}) {
  let icon: LucideIcon = AlertOctagon;
  let title = "Something went wrong";
  let description = errorMessage(error);

  if (isUnauthorized(error)) {
    icon = Lock;
    title = "Your session expired";
    description = "Sign in with Discord again to continue.";
  } else if (isBotMissing(error)) {
    icon = ServerOff;
    title = "INFERA isn't in this server";
    description = "Invite INFERA to this server to manage it from the dashboard.";
  } else if (isForbidden(error)) {
    icon = Lock;
    title = "You don't have permission";
    description = errorMessage(error);
  } else if (error instanceof ApiError && error.code === "NETWORK_ERROR") {
    icon = WifiOff;
    title = "Can't reach INFERA";
    description = error.message;
  } else if (error instanceof ApiError && error.code === "BOT_MISSING_PERMISSION") {
    icon = PlugZap;
    title = "INFERA is missing a Discord permission";
    description = "Give the INFERA role the permission it needs in Server Settings, then try again.";
  }

  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      className={className}
      compact={compact}
      action={
        onRetry ? (
          <Button size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    />
  );
}

/** Standard loading / error / empty switch for a query-backed section. */
export function QueryState<T>({
  query,
  children,
  empty,
  isEmpty,
  skeleton,
}: {
  query: { data: T | undefined; isLoading: boolean; error: unknown; refetch: () => unknown };
  children: (data: T) => ReactNode;
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  skeleton?: ReactNode;
}) {
  if (query.isLoading) return <>{skeleton ?? <SkeletonRows />}</>;
  if (query.error && query.data === undefined) return <ErrorState error={query.error} onRetry={() => void query.refetch()} compact />;
  if (query.data === undefined) return <>{skeleton ?? <SkeletonRows />}</>;
  if (empty && isEmpty?.(query.data)) return <>{empty}</>;
  return <>{children(query.data)}</>;
}
