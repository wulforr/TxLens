import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Single-file components have to be compiled before Vitest can import them.
  // Without this, a component test fails at resolution and looks like a
  // missing file rather than a missing transform.
  plugins: [vue()],
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '~~': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
})
