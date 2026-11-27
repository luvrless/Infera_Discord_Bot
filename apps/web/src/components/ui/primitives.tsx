import { AlertTriangle, Check, ChevronDown, Info, Loader2, Lock, X } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "../../lib/utils";

// ----------------------------------------------------------------- Button

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(`btn-${variant}`, size === "sm" && "btn-sm", className)}
      {...rest}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={cn("btn-icon", className)} {...rest}>
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ Card

export function Card({
  className,
  children,
  as: Tag = "div",
}: {
  className?: string;
  children: ReactNode;
  as?: "div" | "section" | "article";
}) {
  return <Tag className={cn("card", className)}>{children}</Tag>;
}

export function CardHeader({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-ink-700 px-5 py-4", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ink-600 bg-ink-800 text-zinc-300">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
          {description ? <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

// ----------------------------------------------------------------- Badge

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<Tone, string> = {
  neutral: "border-ink-600 bg-ink-750 text-zinc-300",
  accent: "border-accent/30 bg-accent/10 text-accent-soft",
  success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  warning: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  danger: "border-red-500/25 bg-red-500/10 text-red-300",
  info: "border-sky-500/25 bg-sky-500/10 text-sky-300",
};

export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 text-2xs font-medium",
        toneClasses[tone],
        className,
      )}
    >
      {dot ? <span className={cn("h-1.5 w-1.5 rounded-full", dotColor(tone))} /> : null}
      {children}
    </span>
  );
}

export function dotColor(tone: Tone): string {
  return {
    neutral: "bg-zinc-500",
    accent: "bg-accent",
    success: "bg-emerald-400",
    warning: "bg-amber-400",
    danger: "bg-red-400",
    info: "bg-sky-400",
  }[tone];
}

export function StatusDot({ tone, pulse, className }: { tone: Tone; pulse?: boolean; className?: string }) {
  return (
    <span className={cn("relative inline-flex h-2 w-2", className)}>
      {pulse ? <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", dotColor(tone))} /> : null}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", dotColor(tone))} />
    </span>
  );
}

// ---------------------------------------------------------------- Toggle

export function Toggle({
  checked,
  onChange,
  disabled,
  loading,
  label,
  size = "md",
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled || loading}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full border transition-colors focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-4 w-7" : "h-5 w-9",
        checked ? "border-accent bg-accent" : "border-ink-500 bg-ink-650",
      )}
    >
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-white shadow transition-transform",
          size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5",
          checked ? (size === "sm" ? "translate-x-3.5" : "translate-x-[18px]") : "translate-x-0.5",
        )}
      >
        {loading ? <Loader2 className="h-2.5 w-2.5 animate-spin text-accent" /> : null}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------- Inputs

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function TextInput({ className, invalid, ...rest }, ref) {
    return <input ref={ref} className={cn("input", invalid && "input-error", className)} {...rest} />;
  },
);

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function TextArea({ className, invalid, rows = 4, ...rest }, ref) {
    return <textarea ref={ref} rows={rows} className={cn("input resize-y", invalid && "input-error", className)} {...rest} />;
  },
);

export function NativeSelect({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn("input appearance-none pr-8", className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  required,
  aside,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
  required?: boolean;
  aside?: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      {label ? (
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={htmlFor} className="label">
            {label}
            {required ? <span className="ml-0.5 text-red-400">*</span> : null}
          </label>
          {aside}
        </div>
      ) : null}
      {children}
      {error ? <p className="text-xs text-red-400">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn("flex cursor-pointer items-start gap-2.5", disabled && "cursor-not-allowed opacity-60")}>
      <span className="relative mt-0.5 inline-flex">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-ink-500 bg-ink-900 checked:border-accent checked:bg-accent focus-visible:ring-2 focus-visible:ring-accent/50"
        />
        <Check className="pointer-events-none absolute left-0.5 top-0.5 hidden h-3 w-3 text-white peer-checked:block" />
      </span>
      <span>
        <span className="text-13 text-zinc-200">{label}</span>
        {description ? <span className="block text-xs text-zinc-500">{description}</span> : null}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------- Tabs

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: Array<{ id: T; label: ReactNode; count?: number | null; disabled?: boolean }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex items-center gap-1 overflow-x-auto border-b border-ink-700", className)}>
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={active}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative -mb-px flex h-9 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-13 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              active ? "border-accent text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-200",
            )}
          >
            {tab.label}
            {tab.count !== undefined && tab.count !== null ? (
              <span className={cn("rounded px-1.5 text-2xs", active ? "bg-accent/15 text-accent-soft" : "bg-ink-750 text-zinc-500")}>
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: Array<{ value: T; label: ReactNode; disabled?: boolean; title?: string }>;
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex rounded-lg border border-ink-600 bg-ink-900 p-0.5">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          title={option.title}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-2.5 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            size === "sm" ? "h-6 text-xs" : "h-7 text-13",
            option.value === value ? "bg-ink-700 text-zinc-100 shadow-sm" : "text-zinc-500 hover:text-zinc-200",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------- Callouts

export function Callout({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: "info" | "warning" | "danger" | "success" | "neutral";
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = tone === "warning" || tone === "danger" ? AlertTriangle : tone === "success" ? Check : Info;
  const styles = {
    info: "border-sky-500/20 bg-sky-500/[0.06] text-sky-200",
    warning: "border-amber-500/20 bg-amber-500/[0.06] text-amber-200",
    danger: "border-red-500/25 bg-red-500/[0.07] text-red-200",
    success: "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-200",
    neutral: "border-ink-600 bg-ink-800 text-zinc-300",
  }[tone];
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border px-3.5 py-3", styles, className)} role={tone === "danger" ? "alert" : "status"}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
      <div className="min-w-0 flex-1 text-13">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={cn("text-xs leading-relaxed opacity-85", title && "mt-0.5")}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Marks functionality that the backend does not support yet. */
export function Unsupported({ children, title = "Not supported by the INFERA backend yet" }: { children?: ReactNode; title?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed border-ink-600 bg-ink-900/60 px-3.5 py-3">
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
      <div className="text-xs leading-relaxed text-zinc-500">
        <p className="font-medium text-zinc-400">{title}</p>
        {children ? <div className="mt-0.5">{children}</div> : null}
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin text-zinc-500", className)} />;
}

// ---------------------------------------------------------------- Tag input

export function TagInput({
  value,
  onChange,
  placeholder,
  disabled,
  max = 100,
  validate,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  max?: number;
  validate?: (entry: string) => string | null;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const add = () => {
    const entry = draft.trim();
    if (!entry) return;
    const problem = validate?.(entry) ?? null;
    if (problem) {
      setError(problem);
      return;
    }
    if (!value.includes(entry) && value.length < max) onChange([...value, entry]);
    setDraft("");
    setError(null);
  };
  return (
    <div>
      <div className={cn("input flex h-auto min-h-9 flex-wrap items-center gap-1.5 py-1.5", disabled && "opacity-60")}>
        {value.map((entry) => (
          <span key={entry} className="inline-flex max-w-full items-center gap-1 rounded-md border border-ink-600 bg-ink-750 py-0.5 pl-2 pr-1 font-mono text-xs text-zinc-200">
            <span className="truncate">{entry}</span>
            {!disabled ? (
              <button type="button" aria-label={`Remove ${entry}`} onClick={() => onChange(value.filter((item) => item !== entry))} className="rounded p-0.5 text-zinc-500 hover:text-zinc-100">
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </span>
        ))}
        <input
          value={draft}
          disabled={disabled}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add();
            } else if (event.key === "Backspace" && !draft && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={add}
          placeholder={value.length === 0 ? placeholder : "Add…"}
          className="min-w-[8rem] flex-1 bg-transparent text-13 text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
        />
      </div>
      {error ? <p className="mt-1 text-xs text-red-400">{error}</p> : null}
    </div>
  );
}

// -------------------------------------------------------------- Color

export function ColorInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const valid = /^#[0-9a-fA-F]{6}$/.test(draft);
  return (
    <div className="flex items-center gap-2">
      <label className="relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-ink-600" style={{ background: valid ? draft : "#000" }}>
        <input
          type="color"
          value={valid ? draft : "#8b5cf6"}
          disabled={disabled}
          onChange={(event) => {
            setDraft(event.target.value.toUpperCase());
            onChange(event.target.value.toUpperCase());
          }}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Pick colour"
        />
      </label>
      <TextInput
        value={draft}
        disabled={disabled}
        invalid={!valid}
        maxLength={7}
        onChange={(event) => {
          const next = event.target.value.startsWith("#") ? event.target.value : `#${event.target.value}`;
          setDraft(next);
          if (/^#[0-9a-fA-F]{6}$/.test(next)) onChange(next.toUpperCase());
        }}
        className="w-28 font-mono uppercase"
      />
    </div>
  );
}

// ------------------------------------------------------------- Dropdown

export function useClickOutside<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const handle = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", key);
    };
  }, [open, onClose]);
  return ref;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function Avatar({
  src,
  name,
  size = 28,
  className,
  rounded = "full",
}: {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
  rounded?: "full" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  const radius = rounded === "full" ? "rounded-full" : "rounded-lg";
  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn("shrink-0 bg-ink-700 object-cover", radius, className)}
        style={{ width: size, height: size }}
      />
    );
  }
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center bg-ink-700 font-semibold text-zinc-300", radius, className)}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.36) }}
    >
      {letters || "?"}
    </span>
  );
}
