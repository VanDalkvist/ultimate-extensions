import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Run from the Ultimate checkout with its Vitest and test isolation.
const host = process.cwd()

export default {
  resolve: {
    alias: { '@/sdk': join(host, 'web/src/compat/sdk.ts'), '@ultimate': host },
    dedupe: ['vitest', '@earendil-works/pi-durable'],
  },
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    dir: fileURLToPath(new URL('.', import.meta.url)),
    setupFiles: [join(host, 'test/setup.ts'), join(host, 'test/no-group-signals.ts')],
  },
}
