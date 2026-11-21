import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

test('publication excludes quota image and Git ignores attempts to add it by default', () => {
  const root = resolve(import.meta.dirname, '../../..')
  const staged = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=AM'], { cwd: root, encoding: 'utf8' })
  assert.doesNotMatch(staged, /(?:^|\n)docs\/[^\n]+\.(?:png|jpg|jpeg|webp)(?:\n|$)/i)
  assert.equal(execFileSync('git', ['ls-files', 'docs/usage.png'], { cwd: root, encoding: 'utf8' }).trim(), '')
  assert.equal(execFileSync('git', ['check-ignore', 'docs/usage.png'], { cwd: root, encoding: 'utf8' }).trim(), 'docs/usage.png')
})

test('capture CLI refuses a public checkout output before launching any browser', () => {
  const root = resolve(import.meta.dirname, '../../..')
  assert.throws(() => execFileSync(process.execPath, [resolve(root, 'scripts/capture-ui.mjs'), 'http://127.0.0.1:1', resolve(root, 'docs')], {
    env: { ...process.env, CHROME: '/definitely/not/a/browser' }, timeout: 5000, stdio: 'pipe',
  }), error => {
    assert.match(String((error as Error & { stderr?: Buffer }).stderr), /Refusing screenshot output inside the public checkout/)
    return true
  })
})
