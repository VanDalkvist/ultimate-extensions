import { join } from 'node:path'
import { defineExtension, GenerationTask, hook } from '@earendil-works/pi-durable'
import type { DatabaseSync } from 'node:sqlite'
import { openDatabase, UsageCache } from './cache.ts'
import {
  authGate,
  fetchUsage,
  requestAuth,
  RUNTIME_IDS,
  unavailable,
  UsageFailure,
} from './providers.ts'
import type { Runtime } from './providers.ts'
import { PROVIDERS } from './types.ts'
import type { ProviderId, ProviderUsage, UsageView } from './types.ts'

export interface Host {
  userHome: string
  modelRuntime: Runtime
  resource<T>(key: string, create: () => T): T
  onClose(cleanup: () => Promise<void>): void
  onRelease(cleanup: () => Promise<void>): void
  onOpen(callback: () => Promise<void>): void
}

interface LocalState {
  pending: Set<Promise<void>>
  controllers: Set<AbortController>
  db: DatabaseSync
  failures: Map<ProviderId, ProviderUsage>
}

export class UsageTracker {
  private closed = false
  private cache: UsageCache
  private runtime: Runtime
  private local: LocalState
  private fetcher: typeof fetch
  private now: () => number

  constructor(
    cache: UsageCache,
    runtime: Runtime,
    local: LocalState,
    fetcher: typeof fetch = fetch,
    now: () => number = Date.now,
  ) {
    this.cache = cache
    this.runtime = runtime
    this.local = local
    this.fetcher = fetcher
    this.now = now
  }

  async status(): Promise<UsageView> {
    await Promise.all(this.local.pending)
    const providers = await Promise.all(
      PROVIDERS.map(async ({ id }): Promise<ProviderUsage> => {
        try {
          const gated = await authGate(this.runtime, id)
          if (gated) return gated
          const auth = await requestAuth(this.runtime, id, AbortSignal.timeout(10000))
          if (!auth) return unavailable(id, 'Данные авторизации недоступны.')
          return (
            this.cache.read(auth.key) ??
            this.local.failures.get(id) ??
            unavailable(id, 'Нет данных. Откройте панель для обновления.')
          )
        } catch {
          return unavailable(id, 'Не удалось проверить авторизацию или кеш.')
        }
      }),
    )
    return { providers, pins: this.cache.pins(), at: this.now() }
  }

  start(provider?: ProviderId, force = false): Promise<void> {
    if (this.closed) return Promise.resolve()
    const controller = new AbortController()
    this.local.controllers.add(controller)
    const work = Promise.all(
      PROVIDERS.filter(({ id }) => !provider || id === provider).map(({ id }) =>
        this.refreshProvider(id, force, controller.signal),
      ),
    )
      .then(() => undefined)
      .catch(() => {
        console.error('subscription-usage: local refresh failed.')
      })
      .finally(() => {
        this.local.controllers.delete(controller)
        this.local.pending.delete(work)
      })
    this.local.pending.add(work)
    return work
  }

  private async refreshProvider(id: ProviderId, force: boolean, signal: AbortSignal) {
    let key: string | undefined
    let lease: string | undefined
    try {
      if (await authGate(this.runtime, id)) return
      const auth = await requestAuth(this.runtime, id, signal)
      if (signal.aborted) return
      if (!auth) {
        this.local.failures.set(id, unavailable(id, 'Данные авторизации недоступны.'))
        return
      }
      key = auth.key
      lease = this.cache.claim(key, this.now(), force)
      if (!lease) return
      const usage = await fetchUsage(id, auth, signal, this.now(), this.fetcher)
      this.cache.finish(key, lease, usage, this.now())
      this.local.failures.delete(id)
    } catch (error) {
      if (!key || !lease) {
        this.local.failures.set(id, unavailable(id, 'Не удалось проверить авторизацию или кеш.'))
        return
      }
      if (!signal.aborted) {
        const failure =
          error instanceof UsageFailure
            ? error
            : new UsageFailure('Не удалось обновить данные.', this.now() + 30000)
        const previous = this.cache.read(key)
        const snapshot: ProviderUsage = {
          ...(previous ?? unavailable(id, failure.message)),
          state: 'error',
          reason: failure.message,
          checkedAt: this.now(),
        }
        this.cache.finish(key, lease, snapshot, this.now(), failure.retryAt)
      }
    } finally {
      if (key && lease) this.cache.release(key, lease)
    }
  }

  open() {
    this.closed = false
  }

  async close() {
    this.closed = true
    for (const controller of this.local.controllers) controller.abort()
    await Promise.all(this.local.pending)
  }
}

function state(host: Host): LocalState {
  return host.resource('subscription-usage.local', () => {
    const db = openDatabase(join(host.userHome, '.ultimate', 'subscription-usage.sqlite'))
    const local: LocalState = {
      pending: new Set(),
      controllers: new Set(),
      db,
      failures: new Map(),
    }
    host.onClose(async () => {
      for (const controller of local.controllers) controller.abort()
      await Promise.all(local.pending)
      db.close()
    })
    return local
  })
}

function tracker(host: Host): UsageTracker {
  const local = state(host)
  return new UsageTracker(new UsageCache(local.db), host.modelRuntime, local)
}

function argsObject(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== 'object' || Array.isArray(args))
    throw new Error('Expected an argument object.')
  return args as Record<string, unknown>
}

export const actions = {
  async status(args: unknown, { host }: { host: Host }): Promise<UsageView> {
    if (args !== null) throw new Error('Expected null.')
    return tracker(host).status()
  },
  async refresh(args: unknown, { host }: { host: Host }): Promise<UsageView> {
    const value = argsObject(args)
    if (
      Object.keys(value).some((key) => key !== 'provider' && key !== 'force') ||
      (value.provider !== undefined && !PROVIDERS.some(({ id }) => id === value.provider)) ||
      (value.force !== undefined && typeof value.force !== 'boolean')
    )
      throw new Error('Expected { provider?: ProviderId, force?: boolean }.')
    const instance = tracker(host)
    await instance.start(value.provider as ProviderId | undefined, value.force === true)
    return instance.status()
  },
  async pin(args: unknown, { host }: { host: Host }): Promise<UsageView> {
    const value = argsObject(args)
    const keys = new Set([
      'codex.session',
      'codex.weekly',
      'claude.session',
      'claude.weekly',
      'claude.seven_day_sonnet',
      'claude.seven_day_opus',
      'claude.seven_day_oauth_apps',
      'opencode.rolling',
      'opencode.weekly',
      'opencode.monthly',
    ])
    if (
      Object.keys(value).some((key) => key !== 'key' && key !== 'on') ||
      typeof value.key !== 'string' ||
      !keys.has(value.key) ||
      typeof value.on !== 'boolean'
    )
      throw new Error('Expected { key: supported provider.window, on: boolean }.')
    const instance = tracker(host)
    new UsageCache(state(host).db).pin(value.key, value.on)
    return instance.status()
  },
}

export default function subscriptionUsage(host: Host) {
  const instance = tracker(host)
  host.onOpen(async () => instance.open())
  host.onRelease(() => instance.close())
  host.onClose(() => instance.close())
  return defineExtension({
    name: 'subscription-usage',
    hooks: [
      hook(GenerationTask, {
        afterResponse(message) {
          if (message.stopReason === 'error' || message.stopReason === 'aborted') return
          const match = Object.entries(RUNTIME_IDS).find(
            ([, provider]) => provider === message.provider,
          )
          if (match)
            instance.start(match[0] as ProviderId).catch(() => {
              console.error('subscription-usage: background refresh failed.')
            })
        },
      }),
    ],
  })
}
