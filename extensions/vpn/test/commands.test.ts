import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createController } from '../controller.ts'
import { fixture, NODE, SECOND } from './fixture.ts'
const ctx = () => ({ signal: new AbortController().signal })

test('select from direct enables rule, confirms selected server and serializes concurrent commands', async t => {
  const f = await fixture(); t.after(() => f.close()); f.state.mode = 'direct'
  const app = createController(async () => ({ baseUrl: f.url, secret: '', group: 'PROXY' }), fetch)
  const selected = await app.select({ node: SECOND }, ctx())
  assert.equal(selected.activeProxy, SECOND); assert.equal(selected.enabled, true)
  assert.deepEqual(f.state.calls.filter(c => c.method !== 'GET').map(c => [c.method,c.path,c.body]), [
    ['PUT','/proxies/PROXY',{name: SECOND}], ['PATCH','/configs',{mode:'rule'}],
  ])
  await Promise.all([app.power({enabled:false},ctx()), app.select({node:NODE},ctx())])
  assert.equal(f.state.mode, 'rule'); assert.equal(f.state.selected, NODE)
})

test('power means runtime direct/rule, never daemon lifecycle or config replacement', async t => {
  const f = await fixture(); t.after(() => f.close())
  const app = createController(async () => ({ baseUrl:f.url, secret:'', group:'PROXY' }), fetch)
  assert.equal((await app.power({enabled:false},ctx())).mode, 'direct')
  assert.equal((await app.power({enabled:true},ctx())).mode, 'rule')
  assert.ok(f.state.calls.filter(c=>c.method!=='GET').every(c=>c.method==='PATCH' && c.path==='/configs'))
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
  const f = await fixture(); t.after(() => f.close()); f.state.mode='direct'; f.state.failure='/configs'; f.state.failureMethod='PATCH'
  const app = createController(async () => ({ baseUrl:f.url, secret:'', group:'PROXY' }), fetch)
  await assert.rejects(app.select({node:SECOND},ctx()), /Сервер выбран, но включить VPN не удалось/)
  assert.equal(f.state.selected, SECOND)
  assert.equal(f.state.mode, 'direct')
  assert.ok(f.state.calls.some(c=>c.method==='PUT'))
})

test('global mode selection does not silently change the mode', async t => {
  const f=await fixture(); t.after(()=>f.close()); f.state.mode='global'
  const app=createController(async()=>({baseUrl:f.url,secret:'',group:'PROXY'}),fetch)
  assert.equal((await app.select({node:SECOND},ctx())).mode,'global')
  assert.ok(!f.state.calls.some(c=>c.method==='PATCH'))
})
