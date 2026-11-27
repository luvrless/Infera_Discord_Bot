import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cn } from "../lib/utils";

type Tone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: Tone;
}

interface ToastContextValue {
  push: (toast: { title: string; description?: string; tone?: Tone }) => void;
}

const ToastContext = createContext<ToastContextValue>({ push: () => undefined });

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

const icons: Record<Tone, ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  error: <XCircle className="h-4 w-4 text-red-400" />,
  info: <Info className="h-4 w-4 text-sky-400" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((toast: { title: string; description?: string; tone?: Tone }) => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current.slice(-3), { id, tone: "info", ...toast }]);
    setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 6000);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-full max-w-sm flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-xl border bg-ink-800/95 p-3.5 shadow-pop backdrop-blur",
              item.tone === "success" && "border-emerald-500/25",
              item.tone === "error" && "border-red-500/25",
              item.tone === "info" && "border-ink-600",
            )}
            role="status"
          >
            <div className="mt-0.5">{icons[item.tone]}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-zinc-100">{item.title}</p>
              {item.description ? (
                <p className="mt-0.5 break-words text-xs text-zinc-400">{item.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              className="rounded p-1 text-zinc-500 hover:bg-ink-700 hover:text-zinc-200"
              onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
