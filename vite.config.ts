import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // GitHub Pages deployment: set base path to repo name
  base: command === 'build' ? '/reseacher/' : '/',
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm']
  },
  build: {
    target: 'esnext'
  },
  worker: {
    format: 'es'
  }
}))
