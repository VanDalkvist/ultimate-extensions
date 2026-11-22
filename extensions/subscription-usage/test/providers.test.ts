import assert from 'node:assert/strict'
import { test } from 'node:test'
import { authGate, fetchUsage, requestAuth, UsageFailure } from '../providers.ts'
import type { Runtime } from '../providers.ts'

const runtime: Runtime = {
  getModels: () => [],
  listCredentials: async () => [],
  getRegisteredProviderConfig: () => undefined,
  getProviderAuthStatus: () => ({ configured: true }),
  isUsingOAuth: (id) => id !== 'opencode-go',
  getAuth: async () => ({ auth: { apiKey: 'fixture-key' } }),
}
const controller = new AbortController()
const now = 1700000000000

await test('official response fixtures normalize remaining percentages and reset instants', async () => {
  const fixtures = [
    {
      id: 'codex',
      body: {
        rate_limit: {
          primary_window: { used_percent: 12, reset_at: 1700001000, limit_window_seconds: 18000 },
          secondary_window: {
            used_percent: 44,
            reset_at: 1700100000,
            limit_window_seconds: 604800,
          },
        },
      },
      remaining: [88, 56],
    },
    {
      id: 'claude',
      body: {
        five_hour: { utilization: 20, resets_at: '2023-11-14T23:00:00Z' },
        seven_day: { utilization: 60, resets_at: '2023-11-21T23:00:00Z' },
        seven_day_sonnet: { utilization: 10, resets_at: null },
      },
      remaining: [80, 40, 90],
    },
    {
      id: 'opencode',
      body: {
        usage: {
          rolling: { percent: 0.5, resetsAt: '2023-11-14T23:00:00Z' },
          weekly: { percent: 100, resetsAt: '2023-11-21T23:00:00Z' },
          monthly: { percent: 0, resetsAt: '2023-12-01T00:00:00Z' },
        },
      },
      remaining: [99.5, 0, 100],
    },
  ] as const
  for (const fixture of fixtures) {
    const usage = await fetchUsage(
      fixture.id,
      { key: 'identity', headers: {} },
      controller.signal,
      now,
      async (url, options) => {
        assert.equal(typeof url, 'string')
        assert.ok((url as string).startsWith('https://'))
        assert.equal(options?.redirect, 'error')
        assert.ok(options?.signal)
        return Response.json(fixture.body)
      },
    )
    assert.deepEqual(
      usage.windows.map((window) => window.remainingPercent),
      fixture.remaining,
    )
    assert.equal(
      usage.windows[0].resetsAt,
      fixture.id === 'codex' ? '2023-11-14T22:30:00.000Z' : '2023-11-14T23:00:00.000Z',
    )
    assert.equal(usage.fetchedAt, now)
  }
})

await test('missing native Claude authentication and restricted providers never resolve auth or fetch', async () => {
  const unsupported: Runtime = {
    ...runtime,
    isUsingOAuth: () => false,
    getAuth: async () => {
      assert.fail('must not resolve auth')
    },
  }
  for (const id of ['claude', 'cursor', 'antigravity'] as const) {
    assert.equal((await authGate(unsupported, id))?.state, 'unavailable')
    assert.equal(await requestAuth(unsupported, id, controller.signal), undefined)
  }
  assert.match((await authGate(unsupported, 'claude'))!.reason!, /нативный вход Anthropic/)
  assert.ok((await authGate(unsupported, 'cursor'))?.termsUrl)
  assert.ok((await authGate(unsupported, 'antigravity'))?.termsUrl)
})

await test('a pi-multi-account Anthropic login explains the unsupported slot without resolving it', async () => {
  const slots: Runtime = {
    ...runtime,
    isUsingOAuth: () => false,
    listCredentials: async () => [{ providerId: 'anthropic-account-2', type: 'oauth' }],
    getAuth: async () => assert.fail('slot credentials must remain owned by pi-multi-account'),
  }
  const unavailable = await authGate(slots, 'claude')
  assert.equal(unavailable?.state, 'unavailable')
  assert.match(unavailable?.reason ?? '', /pi-multi-account/)
  assert.match(unavailable?.reason ?? '', /⌘K → Log in → Anthropic/)
  assert.equal(await requestAuth(slots, 'claude', controller.signal), undefined)
})

await test('custom-origin authentication cannot reach official usage hosts', async () => {
  const custom: Runtime = {
    ...runtime,
    getAuth: async () => ({
      auth: { apiKey: 'proxy-secret', baseUrl: 'https://proxy.example/v1' },
    }),
  }
  assert.equal(await requestAuth(custom, 'opencode', controller.signal), undefined)
  const configured: Runtime = {
    ...runtime,
    getRegisteredProviderConfig: () => ({ baseUrl: 'https://proxy.example/v1' }),
    getAuth: async () => {
      assert.fail('must not resolve proxy auth')
    },
  }
  assert.equal((await authGate(configured, 'opencode'))?.state, 'unavailable')
  assert.equal(await requestAuth(configured, 'opencode', controller.signal), undefined)
})

await test('provider failures expose no body, headers or transport errors and honor Retry-After', async () => {
  await assert.rejects(
    fetchUsage(
      'opencode',
      { key: 'identity', headers: {} },
      controller.signal,
      now,
      async () =>
        new Response('secret error body', { status: 429, headers: { 'retry-after': '120' } }),
    ),
    (error: unknown) =>
      error instanceof UsageFailure &&
      error.retryAt === now + 120000 &&
      !String(error).includes('secret'),
  )
})
