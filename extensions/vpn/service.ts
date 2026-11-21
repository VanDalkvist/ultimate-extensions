import { MihomoError as VpnError } from './dependencies/mihomo-daemon/index.ts'
import type { Snapshot, VpnPort } from './contracts.ts'

export class VpnService {
  private readonly port: VpnPort
  constructor(port: VpnPort) { this.port = port }

  read(signal: AbortSignal): Promise<Snapshot> { return this.port.read(signal) }

  async select(name: string, signal: AbortSignal): Promise<Snapshot> {
    const before = await this.port.read(signal)
    if (!before.providers.some(p => p.nodes.some(n => n.name === name)))
      throw new VpnError('invalid', 'Этот сервер отсутствует в ручной группе VPN')
    await this.port.select(name, signal)
    if (before.mode === 'direct') {
      try { await this.port.setMode('rule', signal) }
      catch (error) {
        const code = error instanceof VpnError ? error.code : 'api'
        const message = signal.aborted
          ? 'Сервер выбран; запрос включения VPN отменён, режим мог измениться. Обновите состояние.'
          : 'Сервер выбран, но включить VPN не удалось. Обновите состояние.'
        throw new VpnError(code, message, { cause: error })
      }
    }
    const after = await this.port.read(signal)
    if (after.activeProxy !== name || after.mode === 'direct')
      throw new VpnError('conflict', 'Mihomo не подтвердил выбор сервера. Обновите состояние.')
    return after
  }

  async power(enabled: boolean, signal: AbortSignal): Promise<Snapshot> {
    const before = await this.port.read(signal)
    if (enabled && !before.providers.some(p => p.nodes.some(n => n.name === before.activeProxy)))
      throw new VpnError('invalid', 'Сначала выберите сервер VPN')
    const next = enabled ? 'rule' : 'direct'
    await this.port.setMode(next, signal)
    const after = await this.port.read(signal)
    if (after.mode !== next) throw new VpnError('conflict', 'Mihomo не подтвердил смену режима. Обновите состояние.')
    return after
  }

  probe(signal: AbortSignal): Promise<Record<string, number | null>> { return this.port.probe(signal) }
}
