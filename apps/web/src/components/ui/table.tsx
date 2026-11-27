import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn, formatNumber } from "../../lib/utils";
import { SkeletonRows } from "./states";

export interface Column<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  loading,
  empty,
  className,
  dense,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  empty?: ReactNode;
  className?: string;
  dense?: boolean;
}) {
  if (loading && !rows) return <SkeletonRows className="p-4" />;
  if (!rows || rows.length === 0) return <>{empty}</>;
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="border-b border-ink-700">
            {columns.map((column) => (
              <th key={column.id} scope="col" className={cn("table-head", column.headerClassName)}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={cn(loading && "opacity-60 transition-opacity")}>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              tabIndex={onRowClick ? 0 : undefined}
              className={cn(
                "border-b border-ink-700/60 last:border-0",
                onRowClick && "cursor-pointer transition-colors hover:bg-ink-800 focus-visible:bg-ink-800 focus-visible:outline-none",
              )}
            >
              {columns.map((column) => (
                <td key={column.id} className={cn("table-cell", dense && "py-2", column.className)}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-ink-700 px-4 py-2.5 text-xs text-zinc-500">
      <span>
        {formatNumber(from)}–{formatNumber(to)} of {formatNumber(total)}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" className="btn-icon h-7 w-7" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-2 tabular-nums text-zinc-400">
          {page} / {pages}
        </span>
        <button type="button" className="btn-icon h-7 w-7" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** Debounced search input. */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  delay = 250,
  className,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  delay?: number;
  className?: string;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const timer = window.setTimeout(() => onChange(draft), delay);
    return () => window.clearTimeout(timer);
  }, [draft, value, delay, onChange]);
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
      <input
        type="search"
        value={draft}
        autoFocus={autoFocus}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        className="input pl-8 pr-8 [&::-webkit-search-cancel-button]:hidden"
      />
      {draft ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setDraft("");
            onChange("");
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-500 hover:text-zinc-200"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2 border-b border-ink-700 px-4 py-3", className)}>{children}</div>;
}
