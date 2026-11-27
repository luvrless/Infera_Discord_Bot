import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { ErrorBoundary, reloadForNewBuild } from "./components/ui/ErrorBoundary";
import { ToastProvider } from "./components/ui/toast";
import { ApiError } from "./lib/api/client";
import "./index.css";

const queryClient = new QueryClient({
  queryCache: new QueryCache(),
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      // Never retry auth/permission/validation failures; retry transient ones once.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status > 0 && error.status < 500 && error.status !== 429) return false;
        return failureCount < 2;
      },
      retryDelay: (attempt, error) =>
        error instanceof ApiError && error.retryAfter ? error.retryAfter * 1000 : Math.min(8000, 800 * 2 ** attempt),
    },
    mutations: { retry: false },
  },
});

// A page file from an older deploy is gone: fetch the new build once.
window.addEventListener("vite:preloadError", (event) => {
  if (reloadForNewBuild()) event.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
