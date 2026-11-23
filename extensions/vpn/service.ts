import { AI_GATE, GENERAL_GATE } from './contracts.ts'
import { MihomoError as VpnError } from './dependencies/mihomo-daemon/index.ts'
import type { Snapshot, VpnPort } from './contracts.ts'

export class VpnService {
  private readonly port: VpnPort
  constructor(port: VpnPort) { this.port = port }

  read(signal: AbortSignal): Promise<Snapshot> { return this.port.read(signal) }

  private async ensureRuleMode(before: Snapshot, signal: AbortSignal) {
    if (before.mode !== 'rule') await this.port.setMode('rule', signal)
  }

  async select(name: string, signal: AbortSignal): Promise<Snapshot> {
    const before = await this.port.read(signal)
    if (!before.providers.some(p => p.nodes.some(n => n.name === name)))
      throw new VpnError('invalid', 'Этот сервер отсутствует в ручной группе VPN')

    // Rule mode is required for the independent traffic gates to take effect.
    await this.ensureRuleMode(before, signal)
    await this.port.select(name, signal)
    // Selecting a server is an explicit request to turn general VPN routing on.
    if (before.generalGate?.selected === 'DIRECT')
      await this.port.setGate(GENERAL_GATE, 'PROXY', signal)

    const after = await this.port.read(signal)
    if (after.activeProxy !== name || after.mode !== 'rule')
      throw new VpnError('conflict', 'Mihomo не подтвердил выбор сервера и режима Rule. Обновите состояние.')
    return after
  }

  async power(enabled: boolean, signal: AbortSignal): Promise<Snapshot> {
    const before = await this.port.read(signal)
    const gate = before.generalGate
    if (!gate || !gate.options.includes(enabled ? 'PROXY' : 'DIRECT'))
      throw new VpnError('invalid', 'Группа GENERAL-GATE не настроена. Запустите установочный скрипт AI Gate.')
    if (enabled && !before.providers.some(p => p.nodes.some(n => n.name === before.activeProxy)))
      throw new VpnError('invalid', 'Сначала выберите сервер VPN')

    await this.ensureRuleMode(before, signal)
    const target = enabled ? 'PROXY' : 'DIRECT'
    await this.port.setGate(GENERAL_GATE, target, signal)
    const after = await this.port.read(signal)
    if (after.mode !== 'rule' || after.generalGate?.selected !== target)
      throw new VpnError('conflict', 'Mihomo не подтвердил переключение общего VPN. Обновите состояние.')
    return after
  }

  async aiPower(enabled: boolean, signal: AbortSignal): Promise<Snapshot> {
    const before = await this.port.read(signal)
    const gate = before.aiGate
    if (!gate || !gate.options.includes(enabled ? 'PROXY' : 'REJECT'))
      throw new VpnError('invalid', 'Группа AI-GATE не настроена. Запустите установочный скрипт AI Gate.')
    if (enabled && !before.providers.some(p => p.nodes.some(n => n.name === before.activeProxy)))
      throw new VpnError('invalid', 'Сначала выберите сервер VPN')

    // A legacy client may have set global mode=direct. Restore rule mode before
    // opening or closing the AI route so the AI-GATE rule is actually enforced.
    await this.ensureRuleMode(before, signal)
    const target = enabled ? 'PROXY' : 'REJECT'
    await this.port.setGate(AI_GATE, target, signal)
    const after = await this.port.read(signal)
    if (after.mode !== 'rule' || after.aiGate?.selected !== target)
      throw new VpnError('conflict', 'Mihomo не подтвердил переключение AI-доступа. Обновите состояние.')
    return after
  }

  probe(signal: AbortSignal): Promise<Record<string, number | null>> { return this.port.probe(signal) }
}
