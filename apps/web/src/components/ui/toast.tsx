import { AlertTriangle, CheckCircle2, Info, ShieldAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { errorMessage } from "../../lib/api/client";
import { cn } from "../../lib/utils";

type ToastTone = "success" | "error" | "info" | "security";

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  duration: number;
}

interface ToastApi {
  success: (title: string, description?: string) => void;
  error: (title: string, error?: unknown) => void;
  info: (title: string, description?: string) => void;
  security: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), []);

  const push = useCallback(
    (tone: ToastTone, title: string, description?: string, duration = 4500) => {
      counter.current += 1;
      const id = counter.current;
      setItems((current) => [...current.slice(-4), { id, tone, title, description, duration }]);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, description) => push("success", title, description),
      error: (title, error) => push("error", title, error === undefined ? undefined : typeof error === "string" ? error : errorMessage(error), 7000),
      info: (title, description) => push("info", title, description),
      security: (title, description) => push("security", title, description, 10_000),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
          {items.map((item) => {
            const Icon =
              item.tone === "success" ? CheckCircle2 : item.tone === "error" ? AlertTriangle : item.tone === "security" ? ShieldAlert : Info;
            return (
              <div
                key={item.id}
                role={item.tone === "error" || item.tone === "security" ? "alert" : "status"}
                className={cn(
                  "pointer-events-auto flex animate-slide-up items-start gap-3 rounded-xl border bg-ink-800 px-3.5 py-3 shadow-pop",
                  item.tone === "success" && "border-emerald-500/25",
                  item.tone === "error" && "border-red-500/30",
                  item.tone === "info" && "border-ink-600",
                  item.tone === "security" && "border-red-500/50 bg-[#1a0d10]",
                )}
              >
                <Icon
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    item.tone === "success" && "text-emerald-400",
                    item.tone === "error" && "text-red-400",
                    item.tone === "info" && "text-sky-400",
                    item.tone === "security" && "text-red-400",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-13 font-medium text-zinc-100">{item.title}</p>
                  {item.description ? <p className="mt-0.5 break-words text-xs text-zinc-400">{item.description}</p> : null}
                </div>
                <button type="button" aria-label="Dismiss" onClick={() => dismiss(item.id)} className="rounded p-0.5 text-zinc-500 hover:text-zinc-200">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
