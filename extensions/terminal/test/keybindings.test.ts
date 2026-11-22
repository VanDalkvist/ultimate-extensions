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

test('Command+F opens Find on macOS without intercepting shell Ctrl+F', () => {
  assert.equal(isTerminalFindShortcut(key({ metaKey: true })), true)
  assert.equal(isTerminalFindShortcut(key({ ctrlKey: true })), false)
  assert.equal(isTerminalFindShortcut(key({ ctrlKey: true, metaKey: true })), false)
})

test('Ctrl+Shift+F searches on Linux, but ordinary Ctrl+F reaches Bash', () => {
  assert.equal(isTerminalFindShortcut(key({ ctrlKey: true, shiftKey: true })), true)
  assert.equal(isTerminalFindShortcut(key({ ctrlKey: true, shiftKey: false })), false)
})

test('Find never captures Alt combinations or unrelated shortcuts', () => {
  assert.equal(isTerminalFindShortcut(key({ metaKey: true, altKey: true })), false)
  assert.equal(isTerminalFindShortcut(key({ metaKey: true, key: 'g' })), false)
  assert.equal(isTerminalFindShortcut(key({ metaKey: true, key: 'F' })), true)
})
