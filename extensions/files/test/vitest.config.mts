import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Reuse the installed runtime's runner, SDK and test isolation; no separate package install.
export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  resolve: { alias: { '@': '/home/ubuntu/Projects/ultimate/web/src' } },
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: [
      '/home/ubuntu/Projects/ultimate/test/setup.ts',
      '/home/ubuntu/Projects/ultimate/test/no-group-signals.ts',
    ],
  },
})
