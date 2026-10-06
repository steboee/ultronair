import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// config/company.yaml lives at the repo root, outside this app: allow Vite to read it.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, fs: { allow: ['../..'] } },
})
