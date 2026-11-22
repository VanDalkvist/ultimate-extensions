import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readShellPreference, shellPreferenceKey, validShellPreference, writeShellPreference } from '../shell-preference-store.ts'

test('default is system when no stored preference or storage is disabled', () => {
  assert.equal(readShellPreference(), 'system')
  assert.equal(readShellPreference({ getItem: () => null }), 'system')
  assert.equal(readShellPreference({ getItem: () => { throw Error('blocked') } }), 'system')
})

test('write a verified path and recover it after reload, without shell execution', () => {
  const data = new Map<string, string>()
  const store = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
  }
  writeShellPreference('/bin/zsh', store)
  assert.equal(data.get(shellPreferenceKey), '/bin/zsh')
  assert.equal(readShellPreference(store), '/bin/zsh')
  writeShellPreference('system', store)
  assert.equal(readShellPreference(store), 'system')
})

test('reject invalid persisted values, commands and oversized preferences', () => {
  for (const invalid of ['', 'zsh', '../zsh', '/'.repeat(4097)]) {
    assert.equal(validShellPreference(invalid), false)
    assert.throws(() => writeShellPreference(invalid, { setItem: () => {} }))
    assert.equal(readShellPreference({ getItem: () => invalid }), 'system')
  }
})
