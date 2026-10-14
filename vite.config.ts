import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // the ESP32 bridge and experiments live in server/, started with `npm run server`
  // the AWS handler's tests use node:test and run with `npm run test:site`
  test: { include: ['src/**/*.test.ts'] },
  server: { proxy: { '/api': 'http://localhost:8787' } },
})
