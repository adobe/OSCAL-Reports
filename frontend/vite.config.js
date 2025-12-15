import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    // Inject build timestamp at build time
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(new Date().toISOString()),
  },
  server: {
    port: 3021,
    proxy: {
      '/api': {
        target: 'http://localhost:3020',
        changeOrigin: true
      }
    }
  }
})

