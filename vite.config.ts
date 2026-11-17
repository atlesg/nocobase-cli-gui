import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev: vite on :5173 proxies /api and /ws to the local server on :4173.
export default defineConfig({
  root: resolve('src/renderer'),
  publicDir: resolve('public'),
  plugins: [react()],
  build: { outDir: resolve('dist/web'), emptyOutDir: true },
  server: {
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:4173',
      '/ws': { target: 'ws://127.0.0.1:4173', ws: true }
    }
  }
})
