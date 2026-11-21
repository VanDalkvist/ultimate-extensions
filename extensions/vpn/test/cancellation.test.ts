import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createController } from '../controller.ts'
import { fixture, SECOND } from './fixture.ts'

test('cancellation after PUT preserves cancellation cause and explicit uncertain mode outcome', async t => {
  const f=await fixture();t.after(()=>f.close());f.state.mode='direct'
  const abort=new AbortController()
  const transport:typeof fetch=async (url,init)=>{
    if(init?.method==='PATCH')abort.abort()
    return fetch(url,init)
  }
  const app=createController(async()=>({baseUrl:f.url,secret:'',group:'PROXY'}),transport)
  await assert.rejects(app.select({node:SECOND},{signal:abort.signal}),error=>{
    assert.ok(error instanceof Error)
    assert.equal((error as Error & {code:string}).code,'offline')
    assert.ok(error.cause instanceof Error)
    assert.match(error.message,/отменён/)
    return true
  })
  assert.equal(f.state.selected,SECOND)
  assert.equal(f.state.mode,'direct')
})
