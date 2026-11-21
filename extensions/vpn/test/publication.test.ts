import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

test('publication excludes quota image and Git ignores attempts to add it by default', () => {
  const root = resolve(import.meta.dirname, '../../..')
  assert.equal(execFileSync('git', ['ls-files', 'docs/usage.png'], { cwd: root, encoding: 'utf8' }).trim(), '')
  assert.equal(execFileSync('git', ['check-ignore', 'docs/usage.png'], { cwd: root, encoding: 'utf8' }).trim(), 'docs/usage.png')
})
