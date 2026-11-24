import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

test('presentation names only the controller mode, never claims network protection', async () => {
  assert.ok(existsSync(resolve(import.meta.dirname, '../presentation.ts')), 'mode presentation must exist')
  const { modeLabel } = await import('../presentation.ts')
  assert.equal(modeLabel('rule'), 'Mihomo · Rule')
  assert.equal(modeLabel('direct'), 'Mihomo · Direct')
  assert.equal(modeLabel('global'), 'Mihomo · Global')
  assert.equal(modeLabel(null), 'Mihomo · нет данных')
})

test('loopback dashboard is blocked for remote browsers, explicit HTTPS forwarding works', async () => {
  assert.ok(existsSync(resolve(import.meta.dirname, '../presentation.ts')))
  const { canOpenDashboard } = await import('../presentation.ts')
  assert.equal(canOpenDashboard('http://127.0.0.1:9090/ui/', 'remote.example.test'), false)
  assert.equal(canOpenDashboard('http://127.0.0.1:9090/ui/', 'ultimate.localhost'), true)
  assert.equal(canOpenDashboard('https://dashboard.example.test/ui/', 'remote.example.test'), true)
  assert.equal(canOpenDashboard('javascript:alert(1)', 'localhost'), false)
  assert.equal(canOpenDashboard('https://localhost./ui/', 'remote.example.test'), false)
  assert.equal(canOpenDashboard('https://127.0.0.2/ui/', 'remote.example.test'), false)
})

test('gate status requires global rule mode as well as the selected route', async () => {
  const { gateRouteActive } = await import('../presentation.ts')
  assert.equal(gateRouteActive('rule', 'PROXY', 'PROXY'), true)
  assert.equal(gateRouteActive('rule', 'REJECT', 'PROXY'), false)
  assert.equal(gateRouteActive('direct', 'PROXY', 'PROXY'), false)
  assert.equal(gateRouteActive('global', 'PROXY', 'PROXY'), false)
  assert.equal(gateRouteActive(null, 'PROXY', 'PROXY'), false)
  assert.equal(gateRouteActive('rule', null, 'PROXY'), false)
})

test('AI route requires a real selected option in the provider-only group', async () => {
  const { aiRouteActive } = await import('../presentation.ts')
  assert.equal(aiRouteActive('rule', 'AI-NODES', '🇫🇮 node', ['🇫🇮 node', '🇸🇪 node']), true)
  assert.equal(aiRouteActive('rule', 'AI-NODES', null, ['🇫🇮 node']), false)
  assert.equal(aiRouteActive('rule', 'AI-NODES', 'shopproxy', ['🇫🇮 node']), false)
  assert.equal(aiRouteActive('direct', 'AI-NODES', '🇫🇮 node', ['🇫🇮 node']), false)
  assert.equal(aiRouteActive('rule', 'REJECT', '🇫🇮 node', ['🇫🇮 node']), false)
})
