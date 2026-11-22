import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import subscriptionUsage, { actions } from '../server.ts'
import type { Host } from '../server.ts'

await test('release then reopen resumes the existing response hook after a failed core swap', async () => {
  const userHome = mkdtempSync(join(tmpdir(), 'usage-reacquire-'))
  const resources = new Map<string, unknown>()
  const closes: (() => Promise<void>)[] = []
  let release!: () => Promise<void>
  let open = async () => {}
  let requests = 0
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    assert.equal(url, 'https://opencode.ai/zen/go/v1/usage')
    requests++
    return Response.json({ usage: { rolling: { percent: 42 } } })
  }
  const host: Host = {
    userHome,
    modelRuntime: {
      listCredentials: async () => [],
      getModels: () => [],
      getRegisteredProviderConfig: () => undefined,
      getProviderAuthStatus: (id) => ({ configured: id === 'opencode-go' }),
      isUsingOAuth: () => false,
      getAuth: async () => ({ auth: { apiKey: 'synthetic-key' } }),
    },
    resource: <T>(key: string, create: () => T): T => {
      if (!resources.has(key)) resources.set(key, create())
      return resources.get(key) as T
    },
    onOpen: (callback) => {
      open = () => callback().catch((error: unknown) => assert.fail(String(error)))
    },
    onRelease: (callback) => {
      release = callback
    },
    onClose: (callback) => {
      closes.push(callback)
    },
  }
  try {
    const extension = subscriptionUsage(host)
    const { afterResponse } = extension.hooks![0].handlers as {
      afterResponse: (message: { provider: string; stopReason: string }) => void
    }
    await open()
    await release()
    afterResponse({ provider: 'opencode-go', stopReason: 'stop' })
    await actions.status(null, { host })
    assert.equal(requests, 0)
    await open()
    afterResponse({ provider: 'opencode-go', stopReason: 'stop' })
    const view = await actions.status(null, { host })
    assert.equal(requests, 1)
    assert.equal(view.providers[2].windows[0].remainingPercent, 58)
  } finally {
    for (const close of closes) await close()
    globalThis.fetch = originalFetch
    rmSync(userHome, { recursive: true, force: true })
  }
})
