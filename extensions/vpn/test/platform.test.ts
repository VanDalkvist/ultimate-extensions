import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { settingsPaths, openSettings } from '../settings.ts'

test('config defaults cover ARM/Intel macOS, Linux and Windows without a personal home path', () => {
  assert.equal(settingsPaths('/home/demo', 'linux').daemon, '/home/demo/.config/mihomo/config.yaml')
  assert.equal(settingsPaths('/Users/demo', 'darwin', 'x64').daemon, '/usr/local/etc/mihomo/config.yaml')
  assert.equal(settingsPaths('/Users/demo', 'darwin', 'arm64').daemon, '/opt/homebrew/etc/mihomo/config.yaml')
  assert.equal(settingsPaths('C:\\Users\\demo', 'win32').daemon, 'C:\\Users\\demo\\.config\\mihomo\\config.yaml')
})

test('native opening is shell-free on each supported platform and rejects unknown systems', async () => {
  const paths = { daemon: '/tmp/config.yaml', connection: '/tmp/.env' }
  for (const [platform, command, args] of [
    ['darwin', '/usr/bin/open', ['-t', paths.daemon]],
    ['linux', 'xdg-open', [paths.daemon]],
    ['win32', 'notepad.exe', [paths.daemon]],
  ] as const) {
    const calls: unknown[] = []
    await openSettings({ file: 'daemon' }, paths, async () => true, async (...call) => { calls.push(call) }, { platform })
    assert.deepEqual(calls, [[command, args, { timeout: 5000 }]])
  }
  await assert.rejects(openSettings({ file: 'daemon' }, paths, async () => true, async () => {}, { platform: 'aix' }), /не поддерживается/)
})

test('trusted settings file supplies absolute config path and safe Dashboard override, not secrets', async t => {
  const home = await mkdtemp(join(tmpdir(), 'vpn-platform-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  await mkdir(join(home, 'Projects'))
  const file = join(home, 'Projects/.env')
  await writeFile(file, 'MIHOMO_CONFIG_PATH=/custom/mihomo/config.yaml\nMIHOMO_DASHBOARD_URL=https://dashboard.example.test/ui/\nMIHOMO_API_SECRET=test-fixture-only\n')
  const module = await import('../settings.ts')
  assert.equal(typeof module.loadSettingsConfig, 'function')
  const options = await module.loadSettingsConfig(home, async () => true, 'linux')
  assert.equal(options.paths.daemon, '/custom/mihomo/config.yaml')
  assert.equal(options.dashboardUrl, 'https://dashboard.example.test/ui/')
  assert.ok(!JSON.stringify(options).includes('test-fixture-only'))
  for (const value of ['http://remote.example.test/', 'https://user:pass@example.test/', 'https://example.test/?token=bad', 'javascript:alert(1)']) {
    await writeFile(file, 'MIHOMO_DASHBOARD_URL=' + value)
    await assert.rejects(module.loadSettingsConfig(home, async () => true, 'linux'))
  }
  await writeFile(file, 'MIHOMO_CONFIG_PATH=relative/config.yaml')
  await assert.rejects(module.loadSettingsConfig(home, async () => true, 'linux'))
})
