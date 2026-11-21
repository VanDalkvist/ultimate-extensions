/** @jsxImportSource @solidjs/web */
import { Shield, TriangleAlert } from '@lucide/solid'
import { Show, createSignal } from 'solid-js'
import { Popover, PopoverContent } from '@/components/ui/popover.solid.tsx'
import { StatusPopoverTrigger } from '@/components/ui/status-trigger.solid.tsx'
import { defineWebExtension, events, useEvent } from '@/sdk/solid'
import { VpnPanel } from './panel.solid.tsx'
import { useVpn } from './readers.solid.tsx'
import { modeLabel } from './presentation.ts'

function VpnChip() {
  const [open, setOpen] = createSignal(false)
  const vpn = useVpn(open)
  useEvent('vpn:open', () => setOpen(true))
  const flag = () => vpn.status.data()?.activeProxy?.match(/\p{Regional_Indicator}{2}/u)?.[0]
  const label = () => {
    if (vpn.problem()) return 'Mihomo · нет данных'
    if (!vpn.status.data()) return 'Mihomo · …'
    const mode = vpn.status.data()?.mode
    if (mode === 'direct') return modeLabel(mode)
    return [modeLabel(mode), flag(), vpn.status.data()?.activeDelay ? `${vpn.status.data()?.activeDelay} ms` : null].filter(Boolean).join(' · ')
  }
  return (
    <Popover onOpenChange={setOpen} open={open()}>
      <StatusPopoverTrigger aria-label="Открыть VPN" data-vpn-trigger title={vpn.problem() ?? vpn.status.data()?.activeProxy ?? 'VPN'}>
        <Show when={vpn.problem()} fallback={<Shield class="size-3" />}><TriangleAlert class="size-3 text-warning" /></Show>
        <span>{label()}</span>
      </StatusPopoverTrigger>
      <PopoverContent align="end" aria-label="VPN-соединение" class="w-[360px] max-w-[calc(100vw-1rem)] p-0" side="top">
        <VpnPanel close={() => setOpen(false)} vpn={vpn} />
      </PopoverContent>
    </Popover>
  )
}

export default defineWebExtension({
  slots: { 'statusline.right': [{ component: VpnChip, order: -1, phone: true }] },
  commands: [{ id: 'vpn.open', title: 'VPN…', run: () => events.emit('vpn:open', undefined) }],
})
