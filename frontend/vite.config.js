import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Dev: forward API calls to the Express backend, so no CORS setup is needed
  server: { proxy: { '/api': 'http://localhost:3000' } },
})
