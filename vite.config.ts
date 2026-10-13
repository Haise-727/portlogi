import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // the ESP32 bridge and experiments live in server/, started with `npm run server`
  server: { proxy: { '/api': 'http://localhost:8787' } },
})
