import assert from 'node:assert/strict'
import { test } from 'node:test'
import { terminalResumePlan } from '../terminal-replay.ts'

test('BFCache return to the same PTY keeps the screen and reads only after rendered cursor', () => {
  assert.deepEqual(
    terminalResumePlan({ sessionId: 'same', cursor: 100 }, { sessionId: 'same', cursor: 175 }, true),
    { cursor: 175, replayHistory: false, resetOldScreen: false },
  )
})

test('a new native PTY replaces the retained terminal screen', () => {
  assert.deepEqual(
    terminalResumePlan({ sessionId: 'new', cursor: 0 }, { sessionId: 'old', cursor: 175 }, false),
    { cursor: 0, replayHistory: false, resetOldScreen: true },
  )
})

test('an existing but different session clears retained screen and replays new history', () => {
  assert.deepEqual(
    terminalResumePlan({ sessionId: 'new', cursor: 40 }, { sessionId: 'old', cursor: 175 }, true),
    { cursor: 40, replayHistory: true, resetOldScreen: true },
  )
})

test('fresh mount still replays server history normally', () => {
  assert.deepEqual(
    terminalResumePlan({ sessionId: 'same', cursor: 20 }, null, true),
    { cursor: 20, replayHistory: true, resetOldScreen: false },
  )
})

test('server buffer advancing after a hidden page cannot move cursor backward', () => {
  assert.deepEqual(
    terminalResumePlan({ sessionId: 'same', cursor: 300 }, { sessionId: 'same', cursor: 175 }, true),
    { cursor: 300, replayHistory: false, resetOldScreen: false },
  )
})
