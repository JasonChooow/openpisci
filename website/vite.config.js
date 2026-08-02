import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite dev config for the 9xBot marketing site.
// Proxies /api/* to the unified marketplace backend on :8137 so the frontend
// dogfoods the same contract consumed by the 4 desktop clients.
// Dev port 5273 keeps clear of DimRag admin (:5173) and the desktop app (:5174).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5273,
    proxy: {
      '/api': {
        target: process.env.MARKET_API_ORIGIN || 'http://localhost:8137',
        changeOrigin: true,
      },
    },
  },
  // SPA fallback: serve index.html for any non-file route (e.g. /marketplace)
  appType: 'spa',
});
