import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['netlify/**/*.spec.ts', 'netlify/**/*.spec.mts'],
    setupFiles: ['./vitest-setup.ts'],
  },
})
