import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { loadConnection, checkRuntime } from '../dependencies/mihomo-daemon/index.ts'
import { installLink } from './link.ts'
import { checkHost } from './host.ts'

try {
  const source = resolve(import.meta.dirname, '..')
  const host = process.env.ULTIMATE_ROOT || resolve(source, '../../../ultimate')
  const args = process.argv.slice(2)
  if (args.length && (args.length !== 2 || args[0] !== '--replace-from'))
    throw new Error('Usage: install.ts [--replace-from <verified-old-extension-folder>]')
  const result = await installLink(
    source,
    join(homedir(), '.ultimate/extensions/vpn'),
    async () => {
      await checkHost(host, source)
      return checkRuntime(await loadConnection(), fetch, AbortSignal.timeout(5000))
    },
    args[1] ? resolve(args[1]) : undefined,
  )
  console.log(JSON.stringify(result))
} catch (error) {
  console.error(error instanceof Error ? error.message : 'VPN extension installation failed')
  process.exitCode = 1
}
