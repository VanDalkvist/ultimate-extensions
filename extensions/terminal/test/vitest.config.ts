import { fileURLToPath } from 'node:url'

export default {
  resolve: {
    alias: { '@/sdk/solid': fileURLToPath(new URL('../../../../web/src/sdk/api.ts', import.meta.url)) },
  },
  test: {
    include: ['.ultimate/extensions/terminal/test/web/*.test.ts'],
  },
}
