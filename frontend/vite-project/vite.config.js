import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { env } from 'node:process'
import { defineConfig } from 'vite'

// https://vite.dev/config/
const frontendPort = Number(env.FRONTEND_PORT) || 5173

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: frontendPort,
    strictPort: true,
  },
})
