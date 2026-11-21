import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readSettings, openSettings } from '../settings.ts'

const paths={daemon:'/tmp/mihomo/config.yaml',connection:'/tmp/Projects/.env'}
const exists=async()=>true
const conn=async()=>({baseUrl:'http://127.0.0.1:9191',group:'MANUAL',secret:'test-fixture-only'})

test('settings use configured dashboard origin, show file targets and never export secret values',async()=>{
  const result=await readSettings(conn,paths,exists)
  assert.equal(result.dashboardUrl,'http://127.0.0.1:9191/ui/metacubexd/')
  assert.equal(result.group,'MANUAL')
  assert.equal(result.files.daemon.path,paths.daemon)
  assert.ok(!JSON.stringify(result).includes('test-fixture-only'))
})

test('broken connection config or offline daemon does not hide file settings',async()=>{
  const result=await readSettings(async()=>{throw Error('bad configuration')},paths,exists)
  assert.equal(result.dashboardUrl,null)
  assert.ok(result.issue)
  assert.equal(result.files.connection.exists,true)
})

test('missing files are explicit and can never be opened',async()=>{
  const result=await readSettings(conn,paths,async()=>false)
  assert.equal(result.files.daemon.exists,false)
  let calls=0
  await assert.rejects(openSettings({file:'daemon'},paths,async()=>false,async()=>{calls++}),/не найден/)
  assert.equal(calls,0)
})

test('file opening is fixed-target, shell-free and only dispatches native editor; no arbitrary path',async()=>{
  const calls:unknown[]=[]
  const exec=async(command:string,args:string[],options:unknown)=>{calls.push({command,args,options})}
  await openSettings({file:'daemon'},paths,exists,exec)
  assert.deepEqual(calls,[{command:'/usr/bin/open',args:['-a','Zed',paths.daemon],options:{timeout:5000}}])
  for(const arg of [null,{}, {file:'other'}, {file:'daemon',path:'/etc/passwd'}])
    await assert.rejects(openSettings(arg,paths,exists,exec))
  assert.equal(calls.length,1)
})

test('native editor launch failure has safe actionable error and is not reported as opened',async()=>{
  await assert.rejects(openSettings({file:'connection'},paths,exists,async()=>{throw Error('private-detail')}),error=>{
    assert.ok(error instanceof Error)
    assert.match(error.message,/Zed/);assert.ok(!error.message.includes('private-detail'))
    return true
  })
})
