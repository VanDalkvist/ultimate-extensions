import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installLink } from '../scripts/link.ts'

test('installation checks daemon GET readiness and safely links only the extension', async t => {
  const temp=await mkdtemp(join(tmpdir(),'ultimate-vpn-test-'));t.after(()=>rm(temp,{recursive:true,force:true}))
  const source=join(temp,'source');await mkdir(source)
  const target=join(temp,'user/extensions/vpn')
  let checks=0
  assert.equal((await installLink(source,target,async()=>{checks++})).changed,true)
  assert.equal(await realpath(target),await realpath(source))
  assert.equal((await installLink(source,target,async()=>{checks++})).changed,false)
  assert.equal(checks,2)
})

test('installation never replaces a conflicting destination or installs when daemon check fails', async t => {
  const temp=await mkdtemp(join(tmpdir(),'ultimate-vpn-test-'));t.after(()=>rm(temp,{recursive:true,force:true}))
  const source=join(temp,'source');await mkdir(source)
  const target=join(temp,'vpn');await writeFile(target,'user-data')
  await assert.rejects(installLink(source,target,async()=>{}),/already exists/)
  assert.equal(await readFile(target,'utf8'),'user-data')
  const missing=join(temp,'not-installed')
  await assert.rejects(installLink(source,missing,async()=>{throw new Error('offline')}),/offline/)
  await assert.rejects(realpath(missing))
})
