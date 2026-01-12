import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    watch: {
      // Força o Vite a verificar mudanças a cada 100ms - útil no Windows
      usePolling: true,
      interval: 100,
    },
  },
})
