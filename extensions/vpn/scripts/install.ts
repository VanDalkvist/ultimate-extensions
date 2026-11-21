import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { loadConnection, checkRuntime } from '../dependencies/mihomo-daemon/index.ts'
import { installLink } from './link.ts'

try {
  const result = await installLink(
    resolve(import.meta.dirname, '..'),
    join(homedir(), '.ultimate/extensions/vpn'),
    async () => checkRuntime(await loadConnection(), fetch, AbortSignal.timeout(5000)),
  )
  console.log(JSON.stringify(result))
} catch (error) {
  console.error(error instanceof Error ? error.message : 'VPN extension installation failed')
  process.exitCode = 1
}
