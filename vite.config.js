import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Permite acesso pelo IP da rede e 127.0.0.1
    port: 5173,
    strictPort: true,
    watch: {
      usePolling: true, // Útil para detectar mudanças de arquivo no Windows
    },
  },
})
