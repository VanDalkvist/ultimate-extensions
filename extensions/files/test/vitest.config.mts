import { fileURLToPath } from 'node:url'
import { join, resolve as resolvePath } from 'node:path'
import solid from '@solidjs/vite-plugin'
import { defineConfig } from 'vitest/config'

const runtime = process.env.ULTIMATE_CLONE
  ? resolvePath(process.env.ULTIMATE_CLONE)
  : fileURLToPath(new URL('../../../../', import.meta.url))
const root = fileURLToPath(new URL('..', import.meta.url))
const server = { fs: { allow: [root, runtime] } }
const resolve = {
  alias: [
    { find: '@', replacement: join(runtime, 'web/src') },
    { find: '@runtime', replacement: runtime },
  ],
}

export default defineConfig({
  root,
  test: {
    projects: [
      {
        root,
        server,
        resolve,
        test: {
          include: ['test/**/*.test.ts'],
          setupFiles: [join(runtime, 'test/setup.ts'), join(runtime, 'test/no-group-signals.ts')],
        },
      },
      {
        root,
        server,
        resolve,
        plugins: [
          solid({
            include: [
              /\.solid\.tsx$/,
              /\/@ui-sdk\/solid\/dist\/solid\/.*\.jsx$/,
              /\/@lucide\/solid\/dist\/source\/.*\.jsx$/,
            ],
          }),
        ],
        test: {
          environment: 'jsdom',
          server: { deps: { inline: [/solid-js/, /@solidjs\/web/, /@ui-sdk\/solid/] } },
          include: ['test/**/*.test.solid.tsx'],
          setupFiles: [join(runtime, 'test/web/solid-dom-setup.ts')],
        },
      },
    ],
  },
})
