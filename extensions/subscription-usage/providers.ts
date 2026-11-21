import { createHash } from 'node:crypto'
import type { ModelRuntime } from '@earendil-works/pi-coding-agent'
import { PROVIDERS } from './types.ts'
import type { ProviderId, ProviderUsage, UsageWindow } from './types.ts'

export type Runtime = Pick<
  ModelRuntime,
  | 'getAuth'
  | 'isUsingOAuth'
  | 'getProviderAuthStatus'
  | 'getModels'
  | 'getRegisteredProviderConfig'
  | 'listCredentials'
>
export const RUNTIME_IDS = {
  codex: 'openai-codex',
  claude: 'anthropic',
  opencode: 'opencode-go',
} as const
const URLS = {
  codex: 'https://chatgpt.com/backend-api/wham/usage',
  claude: 'https://api.anthropic.com/api/oauth/usage',
  opencode: 'https://opencode.ai/zen/go/v1/usage',
} as const

type RecordValue = Record<string, unknown>
const object = (value: unknown): RecordValue =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : {}
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

export function unavailable(id: ProviderId, reason: string): ProviderUsage {
  return {
    ...PROVIDERS.find((provider) => provider.id === id)!,
    state: 'unavailable',
    reason,
    windows: [],
  }
}

export async function authGate(
  runtime: Runtime,
  id: ProviderId,
): Promise<ProviderUsage | undefined> {
  if (id === 'cursor' || id === 'antigravity')
    return unavailable(id, 'Автоматическое получение лимитов отключено по условиям сервиса.')
  const provider = RUNTIME_IDS[id]
  const status = runtime.getProviderAuthStatus(provider)
  const bases = [
    runtime.getRegisteredProviderConfig(provider)?.baseUrl,
    ...runtime.getModels(provider).map((model) => model.baseUrl),
  ]
  if (bases.some((base) => base !== undefined && !officialOrigin(id, base)))
    return unavailable(id, 'Статистика недоступна для стороннего сервера авторизации.')
  const oauth = runtime.isUsingOAuth(provider)
  if (id === 'claude' && !oauth) {
    const accounts = await runtime.listCredentials()
    const hasSlot = accounts.some(
      ({ providerId, type }) => type === 'oauth' && /^anthropic-account-[1-9]\d*$/.test(providerId),
    )
    return unavailable(
      id,
      hasSlot
        ? 'Вход Anthropic сделан через pi-multi-account. Ultimate читает стандартный вход: войдите через Ultimate (⌘K → Log in → Anthropic).'
        : 'Лимиты доступны через нативный вход Anthropic. Вход Claude Code не используется.',
    )
  }
  if (!status.configured || (id === 'codex' && !oauth))
    return unavailable(id, 'Нет поддерживаемой нативной авторизации.')
  if (id === 'opencode' && oauth) return unavailable(id, 'Для OpenCode Go нужен его API-ключ.')
  return undefined
}

function officialOrigin(id: keyof typeof URLS, base: string): boolean {
  try {
    const url = new URL(base)
    return url.origin === new URL(URLS[id]).origin && !url.username && !url.password
  } catch {
    return false
  }
}

export interface RequestAuth {
  key: string
  headers: Record<string, string>
}

export async function requestAuth(
  runtime: Runtime,
  id: ProviderId,
  signal: AbortSignal,
): Promise<RequestAuth | undefined> {
  if ((await authGate(runtime, id)) || id === 'cursor' || id === 'antigravity') return undefined
  const result = await runtime.getAuth(RUNTIME_IDS[id], { signal })
  const token = result?.auth.apiKey
  if (!token || (result?.auth.baseUrl !== undefined && !officialOrigin(id, result.auth.baseUrl)))
    return undefined
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  let identity = token
  if (id === 'codex') {
    const claims = object(
      JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()),
    )
    const account = object(claims['https://api.openai.com/auth']).chatgpt_account_id
    if (typeof account !== 'string' || !account) return undefined
    identity = account
    headers['ChatGPT-Account-Id'] = account
  }
  if (id === 'claude') headers['anthropic-beta'] = 'oauth-2025-04-20'
  return { key: `${id}:${hash(identity)}`, headers }
}

function window(
  id: string,
  label: string,
  raw: unknown,
  percentKey: string,
  resetKey: string,
): UsageWindow | undefined {
  const data = object(raw)
  const used = data[percentKey]
  if (typeof used !== 'number' || !Number.isFinite(used) || used < 0 || used > 100) return undefined
  const reset = data[resetKey]
  const time =
    typeof reset === 'number' ? reset * 1000 : typeof reset === 'string' ? Date.parse(reset) : NaN
  return {
    id,
    label,
    remainingPercent: 100 - used,
    ...(Number.isFinite(time) ? { resetsAt: new Date(time).toISOString() } : {}),
  }
}

export function normalize(id: ProviderId, raw: unknown, now: number): ProviderUsage {
  const data = object(raw)
  let windows: (UsageWindow | undefined)[] = []
  if (id === 'codex') {
    const limits = object(data.rate_limit)
    const primary = object(limits.primary_window)
    const secondary = object(limits.secondary_window)
    const codexWindow = (limit: RecordValue, fallback: string) => {
      const seconds = limit.limit_window_seconds
      const weekly = seconds === 604800
      return window(
        weekly ? 'weekly' : fallback,
        weekly || fallback === 'weekly' ? 'Weekly' : 'Session',
        limit,
        'used_percent',
        'reset_at',
      )
    }
    const first = codexWindow(primary, 'session')
    const second = codexWindow(secondary, 'weekly')
    windows = [first, second?.id === first?.id ? undefined : second]
  } else if (id === 'claude') {
    windows = [
      window('session', '5 hours', data.five_hour, 'utilization', 'resets_at'),
      window('weekly', 'Weekly', data.seven_day, 'utilization', 'resets_at'),
    ]
    for (const [key, label] of [
      ['seven_day_sonnet', 'Sonnet weekly'],
      ['seven_day_opus', 'Opus weekly'],
      ['seven_day_oauth_apps', 'OAuth apps weekly'],
    ])
      if (data[key] != null) windows.push(window(key, label, data[key], 'utilization', 'resets_at'))
  } else if (id === 'opencode') {
    const usage = object(data.usage)
    windows = ['rolling', 'weekly', 'monthly'].map((key) =>
      window(key, key[0].toUpperCase() + key.slice(1), usage[key], 'percent', 'resetsAt'),
    )
  }
  const valid = windows.filter((entry): entry is UsageWindow => entry !== undefined)
  if (!valid.length) throw new Error('В ответе нет поддерживаемых лимитов.')
  return {
    ...PROVIDERS.find((provider) => provider.id === id)!,
    state: 'ready',
    source:
      id === 'opencode'
        ? 'Подписка OpenCode Go'
        : id === 'claude'
          ? 'Anthropic OAuth'
          : 'Нативный OAuth',
    checkedAt: now,
    fetchedAt: now,
    windows: valid,
  }
}

export class UsageFailure extends Error {
  retryAt: number
  constructor(reason: string, retryAt: number) {
    super(reason)
    this.retryAt = retryAt
  }
}

export async function fetchUsage(
  id: ProviderId,
  auth: RequestAuth,
  signal: AbortSignal,
  now: number,
  fetcher: typeof fetch = fetch,
): Promise<ProviderUsage> {
  if (id === 'cursor' || id === 'antigravity')
    throw new UsageFailure('Запросы для этого сервиса отключены.', now)
  try {
    const response = await fetcher(URLS[id], {
      headers: auth.headers,
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
    })
    if (!response.ok) {
      const retry = response.headers.get('retry-after')
      const seconds = retry !== null && /^\d+(\.\d+)?$/.test(retry) ? Number(retry) * 1000 : NaN
      const delay = Number.isFinite(seconds) ? seconds : retry ? Date.parse(retry) - now : 0
      const retryAt = now + Math.min(86400000, Math.max(30000, Number.isFinite(delay) ? delay : 0))
      throw new UsageFailure(
        response.status === 429
          ? 'Лимит запросов: повтор отложен.'
          : 'Сервис отклонил запрос статистики.',
        retryAt,
      )
    }
    return normalize(id, await response.json(), now)
  } catch (error) {
    if (error instanceof UsageFailure) throw error
    throw new UsageFailure('Не удалось получить данные об использовании.', now + 30000)
  }
}
