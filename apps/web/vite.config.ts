import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The dev server proxies /v1 (REST + WebSocket) to the INFERA API so the
// session cookie stays first-party. Override the target with INFERA_API_PROXY.
const apiTarget = process.env.INFERA_API_PROXY ?? "http://127.0.0.1:3001";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: Number(process.env.WEB_PORT ?? 3000),
    strictPort: true,
    proxy: {
      "/v1": {
        target: apiTarget,
        changeOrigin: false,
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 700,
  },
});
