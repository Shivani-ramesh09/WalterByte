import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Dev: forward API and Auth emulator calls, so the app works through one forwarded port with no CORS setup
    proxy: {
      '/api': 'http://localhost:3000',
      '/identitytoolkit.googleapis.com': 'http://127.0.0.1:9099',
      '/securetoken.googleapis.com': 'http://127.0.0.1:9099',
      '/emulator': 'http://127.0.0.1:9099',
    },
    // Accept port-forwarding/tunnel hostnames (VS Code, ngrok, etc.); Vite blocks unknown hosts by default
    allowedHosts: true,
  },
})
