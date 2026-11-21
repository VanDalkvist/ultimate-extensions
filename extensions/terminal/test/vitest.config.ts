import { fileURLToPath } from 'node:url'

export default {
  resolve: {
    alias: { '@/sdk': fileURLToPath(new URL('../../../../web/src/sdk/api.ts', import.meta.url)) },
  },
  test: {
    include: ['.ultimate/extensions/terminal/test/web/*.test.tsx'],
  },
}
