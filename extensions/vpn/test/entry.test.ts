import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { actions } from '../server.ts'
import { fixture, NODE } from './fixture.ts'

test('production extension actions dispatch through host resources to real HTTP and read back commands', async t => {
  const f = await fixture(); t.after(()=>f.close())
  const home = await mkdtemp(join(tmpdir(),'vpn-entry-'));t.after(()=>rm(home,{recursive:true,force:true}))
  const previous=process.env.HOME;process.env.HOME=home
  t.after(()=>{if(previous===undefined)delete process.env.HOME;else process.env.HOME=previous})
  await mkdir(join(home,'Projects'))
  await writeFile(join(home,'Projects/.env'), `MIHOMO_API_URL=${f.url}\n`)
  const resources = new Map<string,unknown>()
  const host={resource<T>(key:string,create:()=>T):T{if(!resources.has(key))resources.set(key,create());return resources.get(key) as T}}
  const ctx={host,signal:new AbortController().signal}
  const status=await actions.snapshot(null,ctx)
  assert.equal(status.activeProxy,NODE)
  assert.ok(f.state.calls.every(c=>c.method==='GET'))
  await actions.power({enabled:false},ctx)
  assert.equal(f.state.mode,'direct')
  const reloaded=await import('../server.ts?reload')
  await reloaded.actions.select({node:NODE},ctx)
  assert.equal(f.state.mode,'rule');assert.equal(f.state.selected,NODE)
  assert.ok(f.state.calls.some(c=>c.method==='PUT'))
})
