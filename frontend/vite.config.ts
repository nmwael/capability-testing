import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// One config for both gates: `vite build` reads the top-level options,
// `vitest run` reads the `test` block. Keep it minimal — the walking
// skeleton only has to prove the toolchain runs.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/rules': 'http://localhost:8080',
      '/alerts': 'http://localhost:8080',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
        maxForks: 4,
      },
    },
  },
})
