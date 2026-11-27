import { AlertTriangle, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";
import { Button, TextInput } from "./primitives";

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);
}

function useFocusTrap(open: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusable = node?.querySelector<HTMLElement>(
      "[data-autofocus], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])",
    );
    focusable?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !node) return;
      const items = Array.from(
        node.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])"),
      );
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    node?.addEventListener("keydown", trap);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      node?.removeEventListener("keydown", trap);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);
  return ref;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  useEscape(open, onClose);
  const ref = useFocusTrap(open);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative flex max-h-[92vh] w-full animate-slide-up flex-col rounded-t-2xl border border-ink-600 bg-ink-850 shadow-pop sm:rounded-xl",
          size === "sm" && "sm:max-w-md",
          size === "md" && "sm:max-w-lg",
          size === "lg" && "sm:max-w-2xl",
          size === "xl" && "sm:max-w-4xl",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-700 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-zinc-100">{title}</h2>
            {description ? <p className="mt-1 text-xs leading-relaxed text-zinc-500">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="btn-icon -mr-2 -mt-1 h-7 w-7">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children ? <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div> : null}
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink-700 px-5 py-3">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: "md" | "lg";
}) {
  useEscape(open, onClose);
  const ref = useFocusTrap(open);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[65]">
      <div className="absolute inset-0 animate-fade-in bg-black/60" onClick={onClose} aria-hidden />
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        className={cn(
          "absolute inset-y-0 right-0 flex w-full animate-slide-in-right flex-col border-l border-ink-600 bg-ink-850 shadow-pop",
          width === "md" ? "sm:max-w-md" : "sm:max-w-xl",
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-ink-700 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-zinc-100">{title}</h2>
            {subtitle ? <div className="mt-1 text-xs text-zinc-500">{subtitle}</div> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="btn-icon -mr-2 h-7 w-7">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink-700 px-5 py-3">{footer}</div> : null}
      </aside>
    </div>,
    document.body,
  );
}

/**
 * Confirmation for destructive or high-impact actions. `confirmText` forces the
 * operator to type a word before the action is enabled.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "danger",
  loading,
  confirmText,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  loading?: boolean;
  confirmText?: string;
  children?: ReactNode;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);
  const blocked = Boolean(confirmText) && typed.trim().toLowerCase() !== confirmText!.toLowerCase();
  return (
    <Modal
      open={open}
      onClose={loading ? () => undefined : onClose}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          {tone === "danger" ? <AlertTriangle className="h-4 w-4 text-red-400" /> : null}
          {title}
        </span>
      }
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={loading} disabled={blocked}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {confirmText ? (
        <div className={cn("space-y-1.5", children ? "mt-4" : undefined)}>
          <p className="text-xs text-zinc-400">
            Type <span className="font-mono text-zinc-200">{confirmText}</span> to confirm.
          </p>
          <TextInput value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" data-autofocus />
        </div>
      ) : null}
    </Modal>
  );
}
