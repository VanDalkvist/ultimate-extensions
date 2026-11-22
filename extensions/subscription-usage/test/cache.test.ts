import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { openDatabase, UsageCache } from '../cache.ts'
import type { ProviderUsage } from '../types.ts'

const snapshot: ProviderUsage = {
  id: 'codex',
  name: 'Codex',
  state: 'ready',
  fetchedAt: 1000000,
  windows: [{ id: 'weekly', label: 'Weekly', remainingPercent: 70 }],
}

await test('separate database handles dedupe leases, respect TTL/manual/backoff and isolate accounts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'usage-cache-'))
  const path = join(dir, 'usage.sqlite')
  const first = new UsageCache(openDatabase(path))
  const second = new UsageCache(openDatabase(path))
  try {
    const now = 1000000
    const lease = first.claim('codex:account-a', now, false)!
    assert.ok(lease)
    assert.equal(second.claim('codex:account-a', now, true), undefined)
    assert.equal(statSync(path).mode & 0o777, 0o600)
    first.finish('codex:account-a', lease, snapshot, now)
    assert.deepEqual(second.read('codex:account-a'), snapshot)
    assert.equal(second.read('codex:account-b'), undefined)
    assert.equal(second.claim('codex:account-a', now + 29999, true), undefined)
    assert.equal(second.claim('codex:account-a', now + 30000, false), undefined)
    const manual = second.claim('codex:account-a', now + 30000, true)!
    assert.ok(manual)
    second.finish(
      'codex:account-a',
      manual,
      {
        ...snapshot,
        state: 'error',
        reason: 'Provider rate limit; retry is deferred.',
        checkedAt: now + 30000,
      },
      now + 30000,
      now + 600000,
    )
    assert.equal(first.claim('codex:account-a', now + 400000, true), undefined)
    assert.equal(first.read('codex:account-a')?.windows[0].remainingPercent, 70)
    assert.equal(first.read('codex:account-a')?.state, 'error')
    assert.ok(first.claim('codex:account-a', now + 600000, false))
    assert.ok(second.claim('codex:account-b', now, false))
    first.pin('codex.weekly', false)
    second.pin('opencode.monthly', true)
    assert.ok(!second.pins().includes('codex.weekly'))
    assert.ok(first.pins().includes('opencode.monthly'))
  } finally {
    first.close()
    second.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
