import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readlink, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { installLink } from '../scripts/link.ts'

test('explicit migration atomically changes only the expected legacy symlink', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'vpn-migrate-'))
  t.after(() => rm(temp, { recursive: true, force: true }))
  const old = join(temp, 'old'), source = join(temp, 'new'), target = join(temp, 'vpn')
  await mkdir(old); await mkdir(source); await writeFile(join(old, 'keep'), 'preserved')
  await symlink(old, target)
  const result = await installLink(source, target, async () => {}, old)
  assert.equal(result.changed, true)
  assert.equal(await readlink(target), await realpath(source))
  assert.equal(await readFile(join(old, 'keep'), 'utf8'), 'preserved')
})

test('failed preflight or a changed/foreign destination preserves the existing installation', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'vpn-migrate-'))
  t.after(() => rm(temp, { recursive: true, force: true }))
  const old = join(temp, 'old'), other = join(temp, 'other'), source = join(temp, 'new'), target = join(temp, 'vpn')
  for (const path of [old, other, source]) await mkdir(path)
  await symlink(old, target)
  await assert.rejects(installLink(source, target, async () => { throw Error('offline') }, old), /offline/)
  assert.equal(await readlink(target), old)
  await assert.rejects(installLink(source, target, async () => {}, other), /already exists/)
  await assert.rejects(installLink(source, target, async () => { await rm(target); await symlink(other, target) }, old), /changed/)
  assert.equal(await readlink(target), other)
})
