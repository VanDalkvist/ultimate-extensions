import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createController } from '../controller.ts'
import { fixture, NODE, SECOND } from './fixture.ts'
const ctx = () => ({ signal: new AbortController().signal })

test('select from direct restores rule mode and serializes commands', async t => {
  const f = await fixture(); t.after(() => f.close()); f.state.mode = 'direct'
  const app = createController(async () => ({ baseUrl: f.url, secret: '', group: 'PROXY' }), fetch)
  const selected = await app.select({ node: SECOND }, ctx())
  assert.equal(selected.activeProxy, SECOND); assert.equal(selected.mode, 'rule')
  assert.deepEqual(f.state.calls.filter(c => c.method !== 'GET').map(c => [c.method,c.path,c.body]), [
    ['PATCH','/configs',{mode:'rule'}], ['PUT','/proxies/PROXY',{name: SECOND}],
  ])
  await app.power({enabled:false},ctx())
  assert.equal(f.state.mode, 'rule'); assert.equal(f.state.general, 'DIRECT')
  await app.aiPower({enabled:false},ctx())
  assert.equal(f.state.ai, 'REJECT')
  await app.aiPower({enabled:true},ctx())
  assert.equal(f.state.ai, 'PROXY')
})

test('power toggles a selector and keeps global Mihomo mode in rule', async t => {
  const f = await fixture(); t.after(() => f.close())
  const app = createController(async () => ({ baseUrl:f.url, secret:'', group:'PROXY' }), fetch)
  assert.equal((await app.power({enabled:false},ctx())).mode, 'rule')
  assert.equal((await app.power({enabled:true},ctx())).mode, 'rule')
  assert.equal((await app.aiPower({enabled:false},ctx())).aiGate?.selected, 'REJECT')
  assert.ok(f.state.calls.filter(c=>c.method!=='GET').every(c=>c.path!=='/configs'))
})

test('bad arguments or unknown node never cause a write', async t => {
  const f = await fixture(); t.after(() => f.close())
  const app = createController(async () => ({ baseUrl:f.url, secret:'', group:'PROXY' }), fetch)
  for (const arg of [null, {}, {node:'not configured'}, {node:NODE, group:'GLOBAL'}])
    await assert.rejects(app.select(arg,ctx()))
  await assert.rejects(app.power({enabled:'true'},ctx()))
  await assert.rejects(app.snapshot({},ctx()))
  assert.ok(f.state.calls.every(c=>c.method==='GET'))
})

test('probe keeps selection and mode; nonpositive pings remain unknown', async t => {
  const f = await fixture(); t.after(() => f.close())
  const app = createController(async () => ({ baseUrl:f.url, secret:'', group:'PROXY' }), fetch)
  const delays = await app.probe(null,ctx())
  assert.equal(delays[NODE],37); assert.equal(delays[SECOND],null)
  assert.equal(f.state.selected,NODE); assert.equal(f.state.mode,'rule')
  assert.ok(f.state.calls.every(c=>c.method==='GET'))
})

test('partially failed select reports the changed server honestly', async t => {
  const f = await fixture(); t.after(() => f.close()); f.state.mode='direct'; f.state.failure='/proxies/PROXY'; f.state.failureMethod='PUT'
  const app = createController(async () => ({ baseUrl:f.url, secret:'', group:'PROXY' }), fetch)
  await assert.rejects(app.select({node:SECOND},ctx()))
  assert.equal(f.state.selected, NODE)
  assert.equal(f.state.mode, 'rule')
})

test('global mode is normalized to rule when a gate is toggled', async t => {
  const f=await fixture(); t.after(()=>f.close()); f.state.mode='global'
  const app=createController(async()=>({baseUrl:f.url,secret:'',group:'PROXY'}),fetch)
  const after=await app.aiPower({enabled:false},ctx())
  assert.equal(after.mode,'rule')
  assert.equal(after.aiGate?.selected,'REJECT')
})
