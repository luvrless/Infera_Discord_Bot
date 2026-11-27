import { useCallback, useEffect, useSyncExternalStore } from "react";

const KEY = "infera.readAlerts";

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

let cache = load();
const listeners = new Set<() => void>();

function emit() {
  try {
    localStorage.setItem(KEY, JSON.stringify([...cache]));
  } catch {
    // Storage can be unavailable; the in-memory set still works for this tab.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) {
      cache = load();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useReadAlerts() {
  const read = useSyncExternalStore(subscribe, () => cache);

  const markRead = useCallback((id: string) => {
    if (cache.has(id)) return;
    cache = new Set([...cache, id]);
    emit();
  }, []);

  const markMany = useCallback((ids: string[]) => {
    cache = new Set([...cache, ...ids]);
    emit();
  }, []);

  const markAll = useCallback((ids: string[]) => {
    cache = new Set(ids);
    emit();
  }, []);

  useEffect(() => {
    // Refresh from storage when the hook mounts after another tab changed it.
    const stored = load();
    if (stored.size !== cache.size) {
      cache = stored;
      emit();
    }
  }, []);

  return {
    isRead: (id: string) => read.has(id),
    markRead,
    markMany,
    markAll,
    readCount: read.size,
  };
}
