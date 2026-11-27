import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
