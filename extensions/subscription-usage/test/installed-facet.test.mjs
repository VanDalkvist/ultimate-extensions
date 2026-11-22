import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const source = new URL('../../../scripts/install-subscription-usage.sh', import.meta.url)

test('install includes new relative imports, preserves existing data and disables stale React facet', () => {
  const root = mkdtempSync(join(tmpdir(), 'usage-solid-install-'))
  try {
    const checkout = join(root, 'checkout')
    const home = join(root, 'home')
    const folder = join(checkout, 'extensions/subscription-usage')
    const scripts = join(checkout, 'scripts')
    const installed = join(home, '.ultimate/extensions/subscription-usage')
    mkdirSync(folder, { recursive: true })
    mkdirSync(scripts, { recursive: true })
    mkdirSync(installed, { recursive: true })
    copyFileSync(source, join(scripts, 'install-subscription-usage.sh'))
    for (const file of ['README.md', 'web.solid.tsx', 'server.ts', 'lifecycle.ts', 'navigation.ts', 'types.ts']) {
      writeFileSync(join(folder, file), '// ' + file)
    }
    writeFileSync(join(installed, 'web.tsx'), '// old React facet')
    writeFileSync(join(installed, 'local-note.json'), '{"user":"keep"}')
    mkdirSync(join(home, '.ultimate'), { recursive: true })
    writeFileSync(join(home, '.ultimate/subscription-usage.sqlite'), 'persistent data')
    execFileSync('bash', [join(scripts, 'install-subscription-usage.sh')], {
      encoding: 'utf8', env: { ...process.env, HOME: home },
    })
    assert.equal(readFileSync(join(installed, 'navigation.ts'), 'utf8'), '// navigation.ts')
    assert.equal(readFileSync(join(installed, 'web.solid.tsx'), 'utf8'), '// web.solid.tsx')
    assert.equal(existsSync(join(installed, 'web.tsx')), false)
    assert.ok(readdirSync(installed).some(name => name.startsWith('web.tsx.backup-')))
    assert.equal(readFileSync(join(installed, 'local-note.json'), 'utf8'), '{"user":"keep"}')
    assert.equal(readFileSync(join(home, '.ultimate/subscription-usage.sqlite'), 'utf8'), 'persistent data')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('project-scoped Usage override is updated with navigation.ts and backed up', () => {
  const root = mkdtempSync(join(tmpdir(), 'usage-project-override-'))
  try {
    const checkout = join(root, 'checkout')
    const home = join(root, 'home')
    const project = join(root, 'project')
    const sourceFolder = join(checkout, 'extensions/subscription-usage')
    const scripts = join(checkout, 'scripts')
    const projectFacet = join(project, '.ultimate/extensions/subscription-usage')
    mkdirSync(sourceFolder, { recursive: true })
    mkdirSync(scripts, { recursive: true })
    mkdirSync(projectFacet, { recursive: true })
    copyFileSync(source, join(scripts, 'install-subscription-usage.sh'))
    for (const file of ['README.md', 'web.solid.tsx', 'server.ts', 'lifecycle.ts', 'navigation.ts']) {
      writeFileSync(join(sourceFolder, file), '// new ' + file)
    }
    writeFileSync(join(projectFacet, 'web.tsx'), '// old React')
    writeFileSync(join(projectFacet, 'local-note.json'), '{"keep":true}')
    execFileSync('bash', [join(scripts, 'install-subscription-usage.sh'), project], {
      encoding: 'utf8', env: { ...process.env, HOME: home },
    })
    assert.equal(readFileSync(join(projectFacet, 'navigation.ts'), 'utf8'), '// new navigation.ts')
    assert.equal(existsSync(join(projectFacet, 'web.tsx')), false)
    assert.ok(readdirSync(projectFacet).some(name => name.startsWith('web.tsx.backup-')))
    assert.equal(readFileSync(join(projectFacet, 'local-note.json'), 'utf8'), '{"keep":true}')
  } finally { rmSync(root, { recursive: true, force: true }) }
})
