import { AlertOctagon, RefreshCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

const RELOAD_KEY = "infera:chunk-reload";

/** True when a lazily loaded page file is missing (usually after a new deploy). */
export function isChunkError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /dynamically imported module|Importing a module script failed|Failed to fetch|ChunkLoadError|Unable to preload|MIME type/i.test(message);
}

/** Reload once to fetch the new build; never loops. */
export function reloadForNewBuild(): boolean {
  const last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0);
  if (Date.now() - last < 30_000) return false;
  window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  window.location.reload();
  return true;
}

interface Props {
  children: ReactNode;
  /** Changing this value (e.g. the route path) clears a previous error. */
  resetKey?: string;
}

interface State {
  error: unknown;
}

/** Shows a recoverable error instead of a blank page when a screen crashes. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    if (isChunkError(error) && reloadForNewBuild()) return;
    console.error("INFERA dashboard error", error, info.componentStack);
  }

  componentDidUpdate(previous: Props): void {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chunk = isChunkError(this.state.error);
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-ink-600 bg-ink-800 text-red-400">
          <AlertOctagon className="h-[18px] w-[18px]" />
        </div>
        <p className="text-sm font-medium text-zinc-100">{chunk ? "INFERA was updated" : "This page hit an error"}</p>
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-zinc-500">
          {chunk
            ? "A new version of the dashboard was deployed. Reload to continue."
            : this.state.error instanceof Error
              ? this.state.error.message
              : "Something unexpected happened while rendering this page."}
        </p>
        <button type="button" className="btn-primary mt-4" onClick={() => window.location.reload()}>
          <RefreshCw className="h-3.5 w-3.5" /> Reload
        </button>
      </div>
    );
  }
}
