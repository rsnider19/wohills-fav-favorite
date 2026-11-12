import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Lights runs on 5174 (dev) and 4174 (preview) so it can run next to the parade (5173/4173).
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5174 },
  // MapLibre's lazy chunk (the pin map) is ~1.07 MB minified (~290 KB gzip) and loads only on
  // the pin step; the main bundle stays near 500 KB. Warn only above that.
  build: { chunkSizeWarningLimit: 1200 },
  preview: { port: 4174 },
})
