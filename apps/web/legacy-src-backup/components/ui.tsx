import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/utils";

export { cn };

/* ------------------------------------------------------------------ button */

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variantClass: Record<Variant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
};

export function Button({
  variant = "secondary",
  className,
  loading,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button className={cn(variantClass[variant], className)} disabled={props.disabled || loading} {...props}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------- card */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("card", className)}>{children}</div>;
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-700 px-4 py-3.5">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-zinc-500">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      <div className="p-4">{children}</div>
    </Card>
  );
}

/* ------------------------------------------------------------------- badge */

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";
const toneClass: Record<Tone, string> = {
  neutral: "border-ink-600 bg-ink-750 text-zinc-400",
  accent: "border-accent/30 bg-accent/10 text-accent-soft",
  success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
  warning: "border-amber-500/25 bg-amber-500/10 text-amber-400",
  danger: "border-red-500/25 bg-red-500/10 text-red-400",
  info: "border-sky-500/25 bg-sky-500/10 text-sky-400",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-2xs font-medium",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral" }: { tone?: "neutral" | "success" | "danger" | "warning" }) {
  const color =
    tone === "success"
      ? "bg-emerald-400"
      : tone === "danger"
        ? "bg-red-400"
        : tone === "warning"
          ? "bg-amber-400"
          : "bg-zinc-500";
  return <span className={cn("inline-block h-1.5 w-1.5 rounded-full", color)} />;
}

/* ------------------------------------------------------------------ inputs */

export function Field({
  label,
  hint,
  children,
  className,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="block text-[13px] font-medium text-zinc-300" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("input", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("input min-h-[90px] resize-y", className)} {...props} />;
}

export function Select({
  options,
  placeholder,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}) {
  return (
    <select className={cn("input appearance-none", className)} {...props}>
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value} className="bg-ink-800">
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      {label ? (
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-zinc-200">{label}</p>
          {description ? <p className="mt-0.5 text-xs text-zinc-500">{description}</p> : null}
        </div>
      ) : null}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={typeof label === "string" ? label : "Toggle"}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-40",
          checked ? "border-accent bg-accent" : "border-ink-600 bg-ink-700",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ modal */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-[8vh] backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div className={cn("relative w-full rounded-xl border border-ink-600 bg-ink-850 shadow-pop", wide ? "max-w-3xl" : "max-w-lg")}>
        <div className="flex items-start justify-between gap-4 border-b border-ink-700 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
            {description ? <p className="mt-1 text-xs text-zinc-500">{description}</p> : null}
          </div>
          <Button variant="ghost" onClick={onClose} aria-label="Close dialog">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-ink-700 px-5 py-3.5">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-ink-700 bg-ink-850 shadow-pop">
        <div className="flex items-center justify-between border-b border-ink-700 px-5 py-4">
          <div className="text-base font-semibold text-zinc-100">{title}</div>
          <Button variant="ghost" onClick={onClose} aria-label="Close drawer">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-ink-700 px-5 py-3.5">{footer}</div> : null}
      </aside>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  destructive,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={destructive ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        {destructive ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" /> : null}
        <div className="text-sm text-zinc-400">{description}</div>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------- structure */

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-50">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-zinc-500">{description}</p> : null}
        {meta ? <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
        {icon ? <span className="text-zinc-600">{icon}</span> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50">{value}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </Card>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "py-8" : "py-16")}>
      {icon ? <div className="mb-3 text-zinc-600">{icon}</div> : null}
      <p className="text-sm font-medium text-zinc-300">{title}</p>
      {description ? <p className="mt-1 max-w-md text-xs text-zinc-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : "Something went wrong";
  return (
    <Card className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <AlertTriangle className="h-6 w-6 text-amber-400" />
      <div>
        <p className="text-sm font-medium text-zinc-200">This could not be loaded</p>
        <p className="mt-1 text-xs text-zinc-500">{message}</p>
      </div>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </Card>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-ink-750", className)} />;
}

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function Tabs({
  items,
  active,
  onChange,
}: {
  items: Array<{ id: string; label: string; count?: number }>;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-ink-700 pb-px">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            "relative rounded-t-md px-3 py-2 text-[13px] font-medium transition-colors",
            active === item.id ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300",
          )}
        >
          {item.label}
          {item.count !== undefined ? <span className="ml-1.5 text-2xs text-zinc-500">{item.count}</span> : null}
          {active === item.id ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" /> : null}
        </button>
      ))}
    </div>
  );
}

export function Pagination({
  page,
  pages,
  onPage,
  total,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
  total?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-ink-700 px-4 py-3">
      <p className="text-xs text-zinc-500">
        Page {page} of {pages}
        {total !== undefined ? ` · ${total} total` : ""}
      </p>
      <div className="flex gap-1.5">
        <Button variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function InfoNote({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warning" | "danger" }) {
  const cls =
    tone === "warning"
      ? "border-amber-500/20 bg-amber-500/5 text-amber-200/90"
      : tone === "danger"
        ? "border-red-500/20 bg-red-500/5 text-red-200/90"
        : "border-ink-600 bg-ink-750/60 text-zinc-400";
  return <div className={cn("rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed", cls)}>{children}</div>;
}

/* ------------------------------------------------------------ multiselect */

const MultiSelectContext = createContext<{ values: string[]; toggle: (value: string) => void } | null>(null);

export function MultiSelect({
  values,
  onChange,
  children,
  className,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  children: ReactNode;
  className?: string;
}) {
  const context = useMemo(
    () => ({
      values,
      toggle: (value: string) =>
        onChange(values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]),
    }),
    [values, onChange],
  );
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      <MultiSelectContext.Provider value={context}>{children}</MultiSelectContext.Provider>
    </div>
  );
}

export function MultiOption({ value, label }: { value: string; label: string }) {
  const context = useContext(MultiSelectContext);
  if (!context) return null;
  const active = context.values.includes(value);
  return (
    <button
      type="button"
      onClick={() => context.toggle(value)}
      className={cn(
        "rounded-md border px-2 py-1 text-xs transition-colors",
        active
          ? "border-accent/40 bg-accent/15 text-accent-soft"
          : "border-ink-600 bg-ink-750 text-zinc-400 hover:text-zinc-200",
      )}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ misc */

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-xs text-zinc-500">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label ?? "Loading"}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      className={cn("input h-9", className)}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder ?? "Search"}
      type="search"
    />
  );
}

export function useAsyncState<T>(initial: T) {
  return useState<T>(initial);
}
