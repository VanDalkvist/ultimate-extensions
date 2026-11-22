import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerUsageLifetime } from '../lifecycle.ts'

test('a disposable open scope owns each UsageTracker session', async () => {
  let opener: ((scope: { defer(fn: () => void | Promise<void>): void }) => void | Promise<void>) | undefined
  const events: string[] = []
  let pendingCleanup: (() => void | Promise<void>) | undefined
  const host = { onOpen(callback: NonNullable<typeof opener>) { opener = callback } }
  const lifetime = {
    open() {
      assert.ok(pendingCleanup, 'cleanup must be registered before open')
      events.push('open')
    },
    async close() { events.push('close') },
  }
  registerUsageLifetime(host, lifetime)
  assert.ok(opener)
  assert.deepEqual(events, [], 'loading the extension must not start a session')
  for (let i = 0; i < 2; i++) {
    pendingCleanup = undefined
    await opener!({ defer(fn) { pendingCleanup = fn } })
    await pendingCleanup!()
  }
  assert.deepEqual(events, ['open', 'close', 'open', 'close'])
})

test('the contract does not require legacy host.onRelease', async () => {
  let callback: ((scope: { defer(fn: () => void | Promise<void>): void }) => void | Promise<void>) | undefined
  let disposed = false
  registerUsageLifetime(
    { onOpen(fn) { callback = fn } },
    { open() {}, async close() { disposed = true } },
  )
  let release: (() => void | Promise<void>) | undefined
  await callback!({ defer(fn) { release = fn } })
  await release!()
  assert.equal(disposed, true)
})
