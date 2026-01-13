import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1', // Força IPv4 puro
    port: 5173,
    strictPort: true,
    hmr: {
      host: '127.0.0.1',
    },
    watch: {
      usePolling: true, // Garante que o Windows veja suas mudanças de código
    }
  }
})
