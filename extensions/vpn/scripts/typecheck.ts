import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '..')
const ultimate = process.env.ULTIMATE_ROOT || resolve(root, '../../../ultimate')
const run = spawnSync(process.execPath, [resolve(ultimate, 'scripts/check-extension.ts'), root], {
  cwd: root, stdio: 'inherit', timeout: 60_000,
})
if (run.error) console.error(run.error.message)
process.exit(run.status ?? 1)
