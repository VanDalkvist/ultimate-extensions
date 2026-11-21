import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'

const run = promisify(execFile)
export async function checkHost(host: string, extension: string) {
  const checker = join(host, 'scripts/check-extension.ts')
  if (Number(process.versions.node.split('.')[0]) < 26)
    throw new Error('VPN требует Node 26 или новее')
  if (!existsSync(checker))
    throw new Error('Не найден Ultimate SDK; укажите ULTIMATE_ROOT на совместимый checkout Solid 2')
  try { await run(process.execPath, [checker, extension], { timeout: 20_000, maxBuffer: 1_000_000 }) }
  catch { throw new Error('Ultimate SDK несовместим с VPN или проверка не завершилась; выполните npm run typecheck и проверьте ULTIMATE_ROOT') }
}
