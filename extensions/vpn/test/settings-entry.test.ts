import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { actions } from '../server.ts'

test('production settings entry resolves live file targets and dispatches fixed native command without serving content',async t=>{
  const home=await mkdtemp(join(tmpdir(),'vpn-settings-entry-'));t.after(()=>rm(home,{recursive:true,force:true}))
  const previous=process.env.HOME;process.env.HOME=home
  t.after(()=>{if(previous===undefined)delete process.env.HOME;else process.env.HOME=previous})
  await mkdir(join(home,'Projects'))
  const path=join(home,'Projects/.env')
  await writeFile(path,'MIHOMO_API_URL=http://127.0.0.1:9191\nMIHOMO_API_SECRET=test-fixture-only\n')
  const info=await actions.settings(null)
  assert.equal(info.dashboardUrl,'http://127.0.0.1:9191/ui/metacubexd/')
  assert.equal(info.files.connection.path,path)
  assert.equal(info.files.connection.exists,true)
  assert.ok(!JSON.stringify(info).includes('test-fixture-only'))
  const calls:unknown[]=[]
  await actions.openSettings({file:'connection'},{signal:new AbortController().signal,exec:async(command,args,options)=>{calls.push({command,args,options})}})
  const expected = process.platform === 'darwin' ? {command:'/usr/bin/open',args:['-t',path]}
    : process.platform === 'win32' ? {command:'notepad.exe',args:[path]} : {command:'xdg-open',args:[path]}
  assert.deepEqual(calls,[{...expected,options:{timeout:5000}}])
  assert.throws(()=>actions.settings({path:'/etc/passwd'}))
})
