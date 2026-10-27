import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
const frontendPort = Number(process.env.FRONTEND_PORT) || 5173

export default defineConfig(({ command, mode }) => {
  const apiUrl = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL?.trim()
  if (command === 'build' && mode === 'production' && apiUrl) {
    let apiHost = ''
    try { apiHost = new URL(apiUrl, 'https://same-origin.invalid').hostname.toLowerCase() }
    catch { throw new Error('VITE_API_URL must be a valid API URL or same-origin path in a production build.') }
    if (apiHost === 'localhost' || apiHost.endsWith('.localhost') || apiHost === '::1' || apiHost.startsWith('127.')) {
      throw new Error('VITE_API_URL cannot point to a loopback host in a production build. Configure the production API origin or leave it unset when using a same-origin /api proxy.')
    }
  }

  return {
    plugins: [tailwindcss(), react()],
    server: {
      port: frontendPort,
      strictPort: true,
    },
  }
})
