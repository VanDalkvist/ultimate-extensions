import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fixture } from './fixture.ts'

const run = promisify(execFile)

test('installer CLI links the discovered extension root using fixture GET readiness only', async t => {
  const controller = await fixture()
  t.after(() => controller.close())
  const home = await mkdtemp(join(tmpdir(), 'vpn-install-entry-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  await mkdir(join(home, 'Projects'))
  await writeFile(join(home, 'Projects/.env'), `MIHOMO_API_URL=${controller.url}\n`)
  const extension = resolve(import.meta.dirname, '..')
  const { stdout } = await run(process.execPath, [join(extension, 'scripts/install.ts')], {
    env: { ...process.env, HOME: home }, timeout: 10_000,
  })
  const result = JSON.parse(stdout)
  assert.equal(result.installed, true)
  assert.equal(result.changed, true)
  assert.equal(await realpath(join(home, '.ultimate/extensions/vpn')), await realpath(extension))
  assert.ok(controller.state.calls.some(call => call.path === '/version'))
  assert.ok(controller.state.calls.every(call => call.method === 'GET'))
})

test('installer refuses an incompatible host before creating a link or reaching Mihomo', async t => {
  const controller = await fixture(); t.after(() => controller.close())
  const home = await mkdtemp(join(tmpdir(), 'vpn-host-reject-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  await mkdir(join(home, 'Projects'))
  await writeFile(join(home, 'Projects/.env'), `MIHOMO_API_URL=${controller.url}\n`)
  const extension = resolve(import.meta.dirname, '..')
  await assert.rejects(run(process.execPath, [join(extension, 'scripts/install.ts')], {
    env: { ...process.env, HOME: home, ULTIMATE_ROOT: join(home, 'missing-host') }, timeout: 10_000,
  }), error => {
    assert.match(String((error as Error & { stderr?: string }).stderr), /ULTIMATE_ROOT|SDK|совместим/)
    return true
  })
  await assert.rejects(realpath(join(home, '.ultimate/extensions/vpn')))
  assert.equal(controller.state.calls.length, 0)
})
