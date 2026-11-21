import { delay, mode, node, providers, record, selector, text } from './contracts.ts'
import type { Snapshot, VpnPort } from './contracts.ts'
import type { MihomoClient } from './dependencies/mihomo-daemon/index.ts'

export class MihomoAdapter implements VpnPort {
  private readonly client: MihomoClient
  constructor(client: MihomoClient) { this.client = client }

  async read(signal: AbortSignal): Promise<Snapshot> {
    const group = this.client.connection.group
    const abort = new AbortController()
    const joined = AbortSignal.any([signal, abort.signal])
    try {
      const [version, config, proxies, sources] = await Promise.all([
        this.client.request('/version', joined),
        this.client.request('/configs', joined),
        this.client.request('/proxies', joined),
        this.client.request('/providers/proxies', joined),
      ])
      const selected = selector(proxies, group)
      const list = providers(sources, selected.names)
      const ungrouped = selected.names.filter(name =>
        !list.some(p => p.nodes.some(n => n.name === name)) && !['DIRECT', 'REJECT', 'REJECT-DROP'].includes(name),
      ).flatMap(name => {
        const raw = record(record(proxies).proxies)[name]
        if (!raw || record(raw).all !== undefined) return []
        return [node({ ...record(raw), name })]
      })
      if (ungrouped.length) list.push({ id: '__configured__', name: 'Другие серверы', nodes: ungrouped })
      const currentMode = mode(record(config).mode)
      const currentNode = list.flatMap(p => p.nodes).find(n => n.name === selected.selected)
      return {
        issue: null, group, version: text(record(version).version), mode: currentMode,
        enabled: currentMode !== 'direct' && selected.selected !== null && selected.selected !== 'DIRECT',
        activeProxy: selected.selected, activeDelay: currentNode?.delay ?? null, providers: list,
      }
    } finally { abort.abort() }
  }


  async select(name: string, signal: AbortSignal): Promise<void> {
    await this.client.request(`/proxies/${encodeURIComponent(this.client.connection.group)}`, signal, 'PUT', { name })
  }

  async setMode(value: 'rule' | 'direct', signal: AbortSignal): Promise<void> {
    await this.client.request('/configs', signal, 'PATCH', { mode: value })
  }

  async probe(signal: AbortSignal): Promise<Record<string, number | null>> {
    const group = encodeURIComponent(this.client.connection.group)
    const url = encodeURIComponent('https://www.gstatic.com/generate_204')
    const raw = record(await this.client.request(`/group/${group}/delay?timeout=3000&url=${url}`, signal))
    return Object.fromEntries(Object.entries(raw).map(([name, value]) => [name, delay(value)]))
  }
}
