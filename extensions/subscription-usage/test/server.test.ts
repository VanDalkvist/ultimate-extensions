import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { openDatabase, UsageCache } from '../cache.ts'
import { actions, UsageTracker } from '../server.ts'
import type { Runtime } from '../providers.ts'
import type { Host } from '../server.ts'

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'usage-tracker-'))
  const db = openDatabase(join(dir, 'usage.sqlite'))
  const cache = new UsageCache(db)
  const local = {
    pending: new Set<Promise<void>>(),
    controllers: new Set<AbortController>(),
    db,
    failures: new Map(),
  }
  let key = 'account-a-key'
  let configured = true
  let authCalls = 0
  const runtime: Runtime = {
    listCredentials: async () => [],
    getModels: () => [],
    getRegisteredProviderConfig: () => undefined,
    getProviderAuthStatus: () => ({ configured }),
    isUsingOAuth: () => false,
    getAuth: async () => {
      authCalls++
      return { auth: { apiKey: key } }
    },
  }
  return {
    dir,
    cache,
    local,
    runtime,
    key: (value: string) => {
      key = value
    },
    configured: (value: boolean) => {
      configured = value
    },
    authCalls: () => authCalls,
    cleanup: () => {
      cache.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

await test('status awaits local background completion without usage HTTP and checks account identity on every read', async () => {
  const fixture = setup()
  let complete!: (response: Response) => void
  let started!: () => void
  const fetching = new Promise<void>((resolve) => {
    started = resolve
  })
  const tracker = new UsageTracker(
    fixture.cache,
    fixture.runtime,
    fixture.local,
    async () => {
      started()
      return new Promise<Response>((resolve) => {
        complete = resolve
      })
    },
    () => 1000000,
  )
  try {
    const background = tracker.start('opencode')
    await fetching
    let statusFinished = false
    const status = tracker.status().then((view) => {
      statusFinished = true
      return view
    })
    await Promise.resolve()
    assert.equal(statusFinished, false)
    complete(
      Response.json({ usage: { rolling: { percent: 0.5, resetsAt: '2026-11-16T12:00:00Z' } } }),
    )
    await background
    assert.equal((await status).providers[2].windows[0].remainingPercent, 99.5)
    const sharedDb = openDatabase(join(fixture.dir, 'usage.sqlite'))
    const sharedCache = new UsageCache(sharedDb)
    const otherProcess = new UsageTracker(
      sharedCache,
      fixture.runtime,
      { pending: new Set(), controllers: new Set(), db: sharedDb, failures: new Map() },
      async () => {
        assert.fail('status must not fetch usage')
      },
    )
    try {
      assert.equal((await otherProcess.status()).providers[2].windows[0].remainingPercent, 99.5)
    } finally {
      await otherProcess.close()
      sharedCache.close()
    }
    const authCalls = fixture.authCalls()
    await tracker.status()
    assert.ok(fixture.authCalls() > authCalls)
    fixture.key('account-b-key')
    assert.equal((await tracker.status()).providers[2].windows.length, 0)
    const changed = new UsageTracker(
      fixture.cache,
      fixture.runtime,
      fixture.local,
      async () => Response.json({ usage: { rolling: { percent: 70 } } }),
      () => 1000000,
    )
    await changed.start('opencode')
    assert.equal((await changed.status()).providers[2].windows[0].remainingPercent, 30)
    fixture.configured(false)
    assert.equal((await changed.status()).providers[2].windows.length, 0)
  } finally {
    await tracker.close()
    fixture.cleanup()
  }
})

await test('actions reject invalid arguments before accessing host resources', async () => {
  const host = {} as Host
  await assert.rejects(actions.status({}, { host }), /Expected null/)
  await assert.rejects(actions.refresh({ provider: 'other' }, { host }), /Expected/)
  await assert.rejects(actions.refresh({ force: 'yes' }, { host }), /Expected/)
  await assert.rejects(actions.pin({ key: 'claude.secret', on: true }, { host }), /Expected/)
})

await test('host paths stay under userHome/.ultimate and auth errors are sanitized', async () => {
  const userHome = mkdtempSync(join(tmpdir(), 'usage-home-'))
  const resources = new Map<string, unknown>()
  const cleanup: (() => Promise<void>)[] = []
  const host: Host = {
    userHome,
    modelRuntime: {
      listCredentials: async () => [],
      getModels: () => [],
      getRegisteredProviderConfig: () => undefined,
      getProviderAuthStatus: () => ({ configured: true }),
      isUsingOAuth: (id) => id !== 'opencode-go',
      getAuth: async () => {
        throw new Error('secret raw auth failure')
      },
    },
    resource: <T>(key: string, create: () => T): T => {
      if (!resources.has(key)) resources.set(key, create())
      return resources.get(key) as T
    },
    onClose: (callback) => {
      cleanup.push(callback)
    },
    onRelease: () => {},
    onOpen: () => {},
  }
  try {
    const view = await actions.status(null, { host })
    assert.ok(existsSync(join(userHome, '.ultimate', 'subscription-usage.sqlite')))
    assert.equal(existsSync(join(userHome, 'subscription-usage.sqlite')), false)
    for (const provider of view.providers.slice(0, 3)) {
      assert.equal(provider.state, 'unavailable')
      assert.match(provider.reason!, /Не удалось проверить авторизацию/)
    }
    assert.ok(!JSON.stringify(view).includes('secret'))
  } finally {
    for (const close of cleanup) await close()
    rmSync(userHome, { recursive: true, force: true })
  }
})
