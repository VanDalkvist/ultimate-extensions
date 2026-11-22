import assert from 'node:assert/strict'
import { test } from 'node:test'
import { autoStartOnVisit } from '../auto-start.ts'

test('visiting Terminal starts once only after both shell discovery and WTerm readiness', () => {
  let starts = 0
  const visit = autoStartOnVisit(() => { starts++ })
  assert.equal(visit(false, false), false)
  assert.equal(visit(true, false), false)
  assert.equal(visit(false, true), false)
  assert.equal(starts, 0)
  assert.equal(visit(true, true), true)
  assert.equal(visit(true, true), false)
  assert.equal(visit(true, false), false)
  assert.equal(starts, 1)
})

test('a newly mounted Terminal view can request its own inspect/attach without duplicating previous visit', () => {
  let a = 0
  let b = 0
  const first = autoStartOnVisit(() => a++)
  const second = autoStartOnVisit(() => b++)
  assert.equal(first(true, true), true)
  assert.equal(first(true, true), false)
  assert.equal(second(true, true), true)
  assert.equal(a, 1)
  assert.equal(b, 1)
})
