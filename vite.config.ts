import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // the ESP32 bridge and experiments live in server/, started with `npm run server`
  // the AWS handler's tests use node:test and run with `npm run test:site`
  // the random-layout sweeps are CPU heavy; a busy or slow machine should not turn them into false failures
  test: { include: ['src/**/*.test.ts'], testTimeout: 60_000 },
  server: { proxy: { '/api': 'http://localhost:8787' } },
})
