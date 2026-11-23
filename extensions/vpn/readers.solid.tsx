/** @jsxImportSource @solidjs/web */
import { createSignal, onSettled } from 'solid-js'
import { ROOT, actionRef, api, errorMessage, keepLast, useAction } from '@/sdk/solid'
import type { Snapshot } from './contracts.ts'
import { gateRouteActive } from './presentation.ts'

export const SnapshotAction = actionRef<null, Snapshot>('vpn', 'snapshot')
const SelectAction = actionRef<{ node: string }, Snapshot>('vpn', 'select')
const PowerAction = actionRef<{ enabled: boolean }, Snapshot>('vpn', 'power')
const AiPowerAction = actionRef<{ enabled: boolean }, Snapshot>('vpn', 'aiPower')
const ProbeAction = actionRef<null, Record<string, number | null>>('vpn', 'probe')

export function useVpn(open: () => boolean) {
  const [visible, setVisible] = createSignal(true)
  const [busy, setBusy] = createSignal(false)
  const [failure, setFailure] = createSignal<string>()
  const [probed, setProbed] = createSignal<Record<string, number | null>>({})
  onSettled(() => {
    const abort = new AbortController()
    const update = () => setVisible(document.visibilityState !== 'hidden')
    update()
    document.addEventListener('visibilitychange', update, { signal: abort.signal })
    return () => abort.abort()
  })
  const status = useAction(SnapshotAction, null, {
    conversation: ROOT, onError: keepLast, focus: true,
    every: () => visible() ? 15000 : undefined,
    on: () => [open(), visible()],
  })
  const problem = () => status.error() ? 'Не удалось обновить VPN; данные могут устареть' : status.data()?.issue?.message
  const ready = () => !!status.data() && !problem()
  async function run(operation: () => Promise<unknown>) {
    if (busy()) return
    setBusy(true); setFailure(undefined)
    try { await operation(); await status.refetch() }
    catch (error) {
      setFailure(errorMessage(error))
      await status.refetch()
    } finally { setBusy(false) }
  }
  return {
    status, busy, failure, problem, ready,
    select: (node: string) => run(async () => {
      await api.action(SelectAction, { node }, { conversationId: ROOT })
      setProbed({})
    }),
    power: () => run(() => api.action(PowerAction, { enabled: !gateRouteActive(status.data()?.mode, status.data()?.generalGate?.selected, 'PROXY') }, { conversationId: ROOT })),
    aiPower: () => run(() => api.action(AiPowerAction, { enabled: !gateRouteActive(status.data()?.mode, status.data()?.aiGate?.selected, 'AI-NODES') }, { conversationId: ROOT })),
    probe: () => run(async () => setProbed(await api.action(ProbeAction, null, { conversationId: ROOT }))),
    refresh: () => run(() => status.refetch()),
    nodeDelay: (name: string, history: number | null) => Object.hasOwn(probed(), name) ? probed()[name] ?? null : history,
  }
}
export type VpnReader = ReturnType<typeof useVpn>
