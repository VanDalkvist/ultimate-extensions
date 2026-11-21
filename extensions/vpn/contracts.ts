import { MihomoError as VpnError } from './dependencies/mihomo-daemon/index.ts'
import type { IssueCode } from './dependencies/mihomo-daemon/index.ts'
export type Mode = 'rule' | 'direct' | 'global'
export type Issue = { code: IssueCode; message: string }
export type Node = { name: string; type: string; delay: number | null }
export type Provider = { id: string; name: string; nodes: Node[] }
export type Snapshot = {
  issue: Issue | null
  /** Controller mode/selection hint only; never an assertion of traffic protection. */
  enabled: boolean
  mode: Mode | null
  activeProxy: string | null
  activeDelay: number | null
  version: string | null
  group: string
  providers: Provider[]
}
export type Context = { signal: AbortSignal }
export type VpnPort = {
  read(signal: AbortSignal): Promise<Snapshot>
  select(name: string, signal: AbortSignal): Promise<void>
  setMode(mode: 'rule' | 'direct', signal: AbortSignal): Promise<void>
  probe(signal: AbortSignal): Promise<Record<string, number | null>>
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new VpnError('invalid', 'Mihomo вернул некорректные данные')
  return value as Record<string, unknown>
}

export function text(value: unknown): string {
  if (typeof value !== 'string' || !value.length || value.length > 4096)
    throw new VpnError('invalid', 'Mihomo вернул некорректную строку')
  return value
}

export function mode(value: unknown): Mode {
  if (value !== 'rule' && value !== 'direct' && value !== 'global')
    throw new VpnError('invalid', 'Mihomo вернул неизвестный режим')
  return value
}

export function delay(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

export function node(value: unknown): Node {
  const raw = record(value)
  if (raw.history !== undefined && !Array.isArray(raw.history))
    throw new VpnError('invalid', 'Mihomo вернул некорректную историю задержек')
  const history = raw.history as unknown[] | undefined
  const last = history?.at(-1)
  return {
    name: text(raw.name),
    type: text(raw.type),
    delay: last === undefined ? null : delay(record(last).delay),
  }
}

export function providers(value: unknown, selectable: string[]): Provider[] {
  const raw = record(record(value).providers)
  const allowed = new Set(selectable)
  return Object.entries(raw).flatMap(([id, item]) => {
    const provider = record(item)
    if (provider.vehicleType === 'Compatible') return []
    if (!Array.isArray(provider.proxies))
      throw new VpnError('invalid', 'Mihomo вернул некорректный список серверов')
    const nodes = provider.proxies.map(node).filter(n =>
      allowed.has(n.name) && !['dns', 'compatible', 'direct', 'reject'].includes(n.type.toLowerCase()),
    )
    return [{ id, name: provider.name === undefined ? id : text(provider.name), nodes }]
  })
}

export function selector(value: unknown, group: string) {
  const raw = record(record(record(value).proxies)[group])
  if (raw.type !== 'Selector' || !Array.isArray(raw.all) || raw.all.some(v => typeof v !== 'string'))
    throw new VpnError('invalid', 'Группа VPN должна быть ручным селектором Mihomo')
  const selected = raw.now == null ? null : text(raw.now)
  return { selected, names: raw.all as string[] }
}

export function noArgs(value: unknown) {
  if (value !== null) throw new VpnError('invalid', 'Эта операция не принимает параметры')
}

export function commandArg(value: unknown, key: string): unknown {
  const raw = record(value)
  if (Object.keys(raw).length !== 1 || !(key in raw))
    throw new VpnError('invalid', 'Некорректные параметры команды VPN')
  return raw[key]
}
