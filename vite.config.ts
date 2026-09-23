import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const dir = (p: string) => new URL(p, import.meta.url).pathname

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // a interface é carregada de file:// dentro do Electron
  base: './',
  resolve: {
    alias: {
      '@app': dir('./src'),
      '@fin': dir('./src/financas'),
      '@pat': dir('./src/patrimonio'),
      '@fin-shared': dir('./shared/financas'),
      '@pat-shared': dir('./shared/patrimonio'),
    },
  },
  server: { host: '127.0.0.1', port: 5199, strictPort: true },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500, emptyOutDir: true },
})
