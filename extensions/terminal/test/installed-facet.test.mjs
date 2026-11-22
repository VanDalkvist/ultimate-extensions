import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const source = new URL('../../../scripts/install-terminal.sh', import.meta.url)

test('installed Terminal receives new lifecycle, retry and Solid modules without overwriting native dependencies', () => {
  const root = mkdtempSync(join(tmpdir(), 'ultimate-terminal-install-'))
  try {
    const checkout = join(root, 'checkout')
    const home = join(root, 'home')
    const src = join(checkout, 'extensions/terminal')
    const scripts = join(checkout, 'scripts')
    const dest = join(home, '.ultimate/extensions/terminal')
    mkdirSync(src, { recursive: true })
    mkdirSync(scripts, { recursive: true })
    mkdirSync(join(dest, 'node_modules/node-pty'), { recursive: true })
    copyFileSync(source, join(scripts, 'install-terminal.sh'))
    for (const name of ['README.md', 'web.solid.tsx', 'shell-launch.ts', 'lifecycle.ts', 'auto-start.ts', 'errors.ts', 'web.css']) {
      writeFileSync(join(src, name), '// new ' + name)
    }
    writeFileSync(join(dest, 'web.tsx'), '// old facet')
    writeFileSync(join(dest, 'node_modules/node-pty/binding.node'), 'native binding stays')
    execFileSync('bash', [join(scripts, 'install-terminal.sh')], {
      encoding: 'utf8', env: { ...process.env, HOME: home },
    })
    assert.equal(readFileSync(join(dest, 'auto-start.ts'), 'utf8'), '// new auto-start.ts')
    assert.equal(readFileSync(join(dest, 'shell-launch.ts'), 'utf8'), '// new shell-launch.ts')
    assert.equal(existsSync(join(dest, 'web.tsx')), false)
    assert.ok(readdirSync(dest).some(name => name.startsWith('web.tsx.backup-')))
    assert.equal(readFileSync(join(dest, 'node_modules/node-pty/binding.node'), 'utf8'), 'native binding stays')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
