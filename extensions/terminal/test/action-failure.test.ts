import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { readActionFailure } from '../action-failure.ts'

test('transport error for terminal read is retryable', () => {
  assert.equal(readActionFailure({ extension: 'terminal', action: 'read', status: 0 }), 'transport')
})

test('server-side terminal read rejection remains non-retryable', () => {
  assert.equal(readActionFailure({ extension: 'terminal', action: 'read', status: 500 }), 'rejected')
})

test('other actions, extensions and unknown failures are not misclassified as read errors', () => {
  for (const other of [
    null,
    3,
    new Error('fetch failed'),
    { action: 'control', status: 0 },
    { extension: 'other', action: 'read', status: 0 },
  ]) {
    assert.equal(readActionFailure(other), null)
  }
})

test('Solid terminal code never imports the optional SDK ActionError symbol', () => {
  for (const file of ['../web.solid.tsx', '../read-retry.ts']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    assert.equal(source.includes('ActionError'), false)
  }
})
