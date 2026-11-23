import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync, existsSync, lstatSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const repo = fileURLToPath(new URL('../', import.meta.url))
const script = resolve(repo, 'scripts/reinstall-extensions.sh')
const extensions = ['files', 'right-panel-resize', 'subscription-usage', 'terminal', 'themes', 'vpn']

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ultimate-ext-reinstall-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const home = join(root, 'home')
  const ultimateHome = join(home, '.ultimate')
  const ultimateRoot = join(root, 'ultimate')
  const project = join(root, 'project')
  mkdirSync(ultimateHome, { recursive: true })
  mkdirSync(join(ultimateRoot, 'node_modules'), { recursive: true })
  mkdirSync(project, { recursive: true })
  writeFileSync(join(ultimateHome, 'subscription-usage.sqlite'), 'usage-db-sentinel')

  for (const extension of extensions) {
    const target = join(ultimateHome, 'extensions', extension)
    mkdirSync(target, { recursive: true })
    writeFileSync(join(target, 'old-install.txt'), `old-user-${extension}`)
  }
  const filesNodeModules = join(ultimateHome, 'extensions', 'files', 'node_modules')
  rmSync(filesNodeModules, { recursive: true, force: true })
  symlinkSync(join(ultimateRoot, 'node_modules'), filesNodeModules, 'dir')

  const pty = join(ultimateHome, 'extensions', 'terminal', 'node_modules', 'node-pty')
  mkdirSync(pty, { recursive: true })
  writeFileSync(join(pty, 'package.json'), JSON.stringify({ version: '1.1.0' }))
  writeFileSync(join(pty, 'native-helper-sentinel'), 'keep-native-dependency')

  const projectUsage = join(project, '.ultimate', 'extensions', 'subscription-usage')
  mkdirSync(projectUsage, { recursive: true })
  writeFileSync(join(projectUsage, 'old-project.txt'), 'project-override')

  const env = {
    ...process.env,
    HOME: home,
    ULTIMATE_HOME: ultimateHome,
    ULTIMATE_ROOT: ultimateRoot,
  }
  return { root, home, ultimateHome, ultimateRoot, project, env }
}

function run(args, env) {
  return spawnSync('bash', [script, ...args], {
    cwd: repo,
    env,
    encoding: 'utf8',
    timeout: 30000,
  })
}

function assertOk(result) {
  assert.equal(result.error, undefined, result.error?.message)
  assert.equal(result.status, 0, `exit=${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
}

test('dry-run reports six global extensions and changes no installed files', t => {
  const f = fixture(t)
  const result = run(['--dry-run'], f.env)
  assertOk(result)
  for (const extension of extensions) {
    assert.match(result.stdout, new RegExp(`global ${extension} ->`))
    assert.equal(readFileSync(join(f.ultimateHome, 'extensions', extension, 'old-install.txt'), 'utf8'), `old-user-${extension}`)
  }
  assert.equal(existsSync(join(f.ultimateHome, '.extension-backups')), false)
})

test('apply stages all extensions, updates an existing project override and rollback restores both', t => {
  const f = fixture(t)
  const result = run(['--apply', '--project-root', f.project], f.env)
  assertOk(result)

  const backupMatch = result.stdout.match(/\[backup\] ([^\n]+)/)
  assert.ok(backupMatch, result.stdout)
  const backupId = backupMatch[1].split('/').at(-1)

  for (const extension of extensions) {
    const installed = join(f.ultimateHome, 'extensions', extension)
    assert.equal(existsSync(join(installed, 'old-install.txt')), false)
    assert.equal(readFileSync(join(installed, 'README.md'), 'utf8'), readFileSync(join(repo, 'extensions', extension, 'README.md'), 'utf8'))
  }

  const installedFilesModules = lstatSync(join(f.ultimateHome, 'extensions', 'files', 'node_modules'))
  assert.equal(installedFilesModules.isSymbolicLink(), true)
  assert.equal(readFileSync(join(f.ultimateHome, 'extensions', 'terminal', 'node_modules', 'node-pty', 'native-helper-sentinel'), 'utf8'), 'keep-native-dependency')
  assert.equal(readFileSync(join(f.ultimateHome, 'subscription-usage.sqlite'), 'utf8'), 'usage-db-sentinel')

  const projectInstalled = join(f.project, '.ultimate', 'extensions', 'subscription-usage')
  assert.equal(existsSync(join(projectInstalled, 'old-project.txt')), false)
  assert.equal(readFileSync(join(projectInstalled, 'navigation.ts'), 'utf8'), readFileSync(join(repo, 'extensions/subscription-usage/navigation.ts'), 'utf8'))

  const rollback = run(['--rollback', backupId], f.env)
  assertOk(rollback)
  for (const extension of extensions) {
    assert.equal(readFileSync(join(f.ultimateHome, 'extensions', extension, 'old-install.txt'), 'utf8'), `old-user-${extension}`)
  }
  assert.equal(readFileSync(join(projectInstalled, 'old-project.txt'), 'utf8'), 'project-override')
  assert.equal(existsSync(join(projectInstalled, 'navigation.ts')), false)
  assert.equal(readFileSync(join(f.ultimateHome, 'subscription-usage.sqlite'), 'utf8'), 'usage-db-sentinel')

  const secondRollback = run(['--rollback', backupId], f.env)
  assert.notEqual(secondRollback.status, 0)
  assert.match(secondRollback.stderr, /already rolled back/)
})

test('foreign extension symlink aborts preflight before any copy is replaced', t => {
  const f = fixture(t)
  const victim = join(f.ultimateHome, 'extensions', 'vpn')
  rmSync(victim, { recursive: true, force: true })
  const foreign = join(f.root, 'foreign-vpn')
  mkdirSync(foreign)
  writeFileSync(join(foreign, 'keep.txt'), 'foreign-data')
  symlinkSync(foreign, victim, 'dir')

  const result = run(['--apply'], f.env)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Refusing foreign extension symlink/)
  assert.equal(readFileSync(join(f.ultimateHome, 'extensions', 'files', 'old-install.txt'), 'utf8'), 'old-user-files')
  assert.equal(readFileSync(join(foreign, 'keep.txt'), 'utf8'), 'foreign-data')
  assert.equal(existsSync(join(f.ultimateHome, '.extension-backups')), false)
})

test('repo-linked extension sources stay linked and a fully linked install is a no-op', t => {
  const f = fixture(t)
  for (const extension of extensions) {
    const target = join(f.ultimateHome, 'extensions', extension)
    rmSync(target, { recursive: true, force: true })
    symlinkSync(join(repo, 'extensions', extension), target, 'dir')
  }
  const result = run(['--apply'], f.env)
  assertOk(result)
  assert.match(result.stdout, /nothing to copy/)
  assert.equal(existsSync(join(f.ultimateHome, '.extension-backups')), false)
})
