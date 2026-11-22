import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isTerminalFindShortcut } from '../terminal-keybindings.ts'

function key(extra: Partial<Parameters<typeof isTerminalFindShortcut>[0]>) {
  return {
    key: 'f',
    altKey: false,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    ...extra,
  }
}

test('macOS only uses Command+F; readline Ctrl+F remains available', () => {
  assert.equal(isTerminalFindShortcut(key({ metaKey: true }), 'MacIntel'), true)
  assert.equal(isTerminalFindShortcut(key({ ctrlKey: true }), 'MacIntel'), false)
  assert.equal(isTerminalFindShortcut(key({ ctrlKey: true, shiftKey: true }), 'MacIntel'), false)
  assert.equal(isTerminalFindShortcut(key({ metaKey: true, shiftKey: true }), 'MacIntel'), false)
})

test('Linux/Windows only uses Ctrl+Shift+F, never Command/Windows+F', () => {
  for (const platform of ['Linux x86_64', 'Win32']) {
    assert.equal(isTerminalFindShortcut(key({ ctrlKey: true, shiftKey: true }), platform), true)
    assert.equal(isTerminalFindShortcut(key({ metaKey: true }), platform), false)
    assert.equal(isTerminalFindShortcut(key({ ctrlKey: true }), platform), false)
    assert.equal(isTerminalFindShortcut(key({ metaKey: true, ctrlKey: true }), platform), false)
  }
})

test('Alt combinations, unrelated keys, and extra modifiers do not trigger Find', () => {
  assert.equal(isTerminalFindShortcut(key({ metaKey: true, altKey: true }), 'MacIntel'), false)
  assert.equal(isTerminalFindShortcut(key({ metaKey: true, key: 'g' }), 'MacIntel'), false)
  assert.equal(isTerminalFindShortcut(key({ metaKey: true, key: 'F' }), 'MacIntel'), true)
  assert.equal(isTerminalFindShortcut(key({ ctrlKey: true, shiftKey: true, altKey: true }), 'Linux'), false)
})

test('fallback to a macOS user-agent string still recognizes Command+F', () => {
  const macUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
  assert.equal(isTerminalFindShortcut(key({ metaKey: true }), macUserAgent), true)
  assert.equal(isTerminalFindShortcut(key({ ctrlKey: true, shiftKey: true }), macUserAgent), false)
})
