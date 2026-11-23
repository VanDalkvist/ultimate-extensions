import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createController } from '../controller.ts'
import { fixture, NODE, SECOND } from './fixture.ts'

test('snapshot reads gate state, provider latency and omits credentials', async t => {
  const f = await fixture(); t.after(() => f.close())
  const app = createController(async () => ({ baseUrl: f.url, secret: '', group: 'PROXY' }), fetch)
  const result = await app.snapshot(null, { signal: new AbortController().signal })
  assert.equal(result.issue, null)
  assert.equal(result.version, '1.19.34')
  assert.equal(result.mode, 'rule')
  assert.equal(result.activeProxy, NODE)
  assert.equal(result.activeDelay, 42)
  assert.equal(result.generalGate?.selected, 'PROXY')
  assert.equal(result.aiGate?.selected, 'PROXY')
  assert.deepEqual(result.providers.map(p => p.nodes.map(n => n.name)), [[NODE], [SECOND]])
  assert.equal(result.providers[1]!.nodes[0]!.delay, null)
  assert.ok(f.state.calls.every(c => c.method === 'GET'))
  assert.ok(!JSON.stringify(result).includes('not-exported'))
  assert.ok(!JSON.stringify(result).includes('private-subscription'))
})

test('direct legacy mode keeps gate state visible', async t => {
  const f = await fixture(); t.after(() => f.close()); f.state.mode = 'direct'
  const app = createController(async () => ({ baseUrl: f.url, secret: '', group: 'PROXY' }), fetch)
  const result = await app.snapshot(null, { signal: new AbortController().signal })
  assert.equal(result.issue, null)
  assert.equal(result.enabled, true)
  assert.equal(result.providers.length, 2)
})

test('bad upstream data and offline state are explicit', async t => {
  const f = await fixture(); t.after(() => f.close()); f.state.malformed = true
  const app = createController(async () => ({ baseUrl: f.url, secret: '', group: 'PROXY' }), fetch)
  const result = await app.snapshot(null, { signal: new AbortController().signal })
  assert.equal(result.issue?.code, 'invalid')
  assert.equal(result.mode, null)
  assert.equal(result.activeProxy, null)
  assert.equal(result.aiGate, null)
})
