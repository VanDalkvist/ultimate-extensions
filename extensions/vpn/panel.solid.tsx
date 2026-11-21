/** @jsxImportSource @solidjs/web */
import { Check, ChevronDown, LoaderCircle, Power, RefreshCw, Shield } from '@lucide/solid'
import { For, Show, createMemo, createSignal } from 'solid-js'
import { Button } from '@/components/ui/button.solid.tsx'
import { SegmentedControl, SegmentedControlItem } from '@/components/ui/segmented-control.solid.tsx'
import { cn } from '@/sdk/solid'
import type { VpnReader } from './readers.solid.tsx'
import { SettingsAccess } from './settings.solid.tsx'
import { modeLabel } from './presentation.ts'

export function VpnPanel(props: { vpn: VpnReader; close: () => void }) {
  const [chosen, setChosen] = createSignal<string | null>(null)
  const providers = () => props.vpn.status.data()?.providers ?? []
  const active = () => props.vpn.status.data()?.activeProxy
  const provider = createMemo(() =>
    providers().find(p => p.id === chosen()) ??
    providers().find(p => p.nodes.some(n => n.name === active())) ??
    providers()[0],
  )
  const blocked = () => !props.vpn.ready() || props.vpn.busy()
  const statusLabel = () => modeLabel(props.vpn.ready() ? props.vpn.status.data()?.mode : null)
  return (
    <section aria-label="Управление VPN" class="flex max-h-[min(480px,75dvh)] flex-col gap-3 p-3 text-xs" data-vpn-panel>
      <header class="flex shrink-0 items-center justify-between gap-2">
        <div class="flex items-center gap-1.5 font-medium">
          <Shield class="size-3.5" /><span>{statusLabel()}</span>
        </div>
        <div class="flex items-center gap-1">
          <Button aria-label="Обновить пинги VPN" class="h-7 w-7 p-0" disabled={blocked()} onClick={() => props.vpn.probe()} size={null} title="Измерить задержки" variant="ghost">
            <RefreshCw class={cn('size-3.5', props.vpn.busy() && 'animate-spin')} />
          </Button>
          <Button aria-label="Закрыть управление VPN" class="h-7 w-7 p-0" onClick={props.close} size={null} variant="ghost"><ChevronDown class="size-4" /></Button>
        </div>
      </header>
      <Show when={props.vpn.problem()}>
        {(message) => <div class="space-y-2 rounded-md bg-muted p-3"><p role="alert">{message()}</p><Button onClick={() => props.vpn.refresh()} size="sm" variant="outline">Повторить запрос VPN</Button></div>}
      </Show>
      <Show when={!props.vpn.status.data() && !props.vpn.status.error()}>
        <p aria-busy="true" class="flex items-center gap-2 py-6 text-muted-foreground"><LoaderCircle class="size-3.5 animate-spin" />Читаю состояние Mihomo…</p>
      </Show>
      <Show when={props.vpn.ready()}>
        <div class="flex shrink-0 items-start gap-3">
          <p class="min-w-0 flex-1 leading-relaxed break-words">{active() ?? 'Сервер не выбран'}</p>
          <Button aria-label={props.vpn.status.data()?.enabled ? 'Переключить Mihomo в Direct' : 'Переключить Mihomo в Rule'} class="h-7 shrink-0 gap-1.5 px-2 text-xs" disabled={blocked()} onClick={() => props.vpn.power()} size={null} variant="ghost">
            <Power class="size-3.5" />{props.vpn.status.data()?.enabled ? 'В Direct' : 'В Rule'}
          </Button>
        </div>
        <Show when={providers().length} fallback={<p class="py-5 text-muted-foreground">В группе нет серверов. Настройки Mihomo остаются без изменений.</p>}>
          <SegmentedControl aria-label="Подписка VPN" class="max-w-full overflow-x-auto" onValueChange={id => setChosen(id)} value={provider()?.id ?? null}>
            <For each={providers()} keyed={p => p.id}>
              {p => <SegmentedControlItem value={p().id}>{p().name}<span class="text-muted-foreground">{p().nodes.length}</span></SegmentedControlItem>}
            </For>
          </SegmentedControl>
          <div aria-label="Серверы VPN" class="min-h-0 space-y-1 overflow-y-auto">
            <For each={provider()?.nodes ?? []} keyed={n => n.name}>
              {n => (
                <Button aria-label={`Выбрать сервер ${n().name}`} aria-pressed={active() === n().name ? 'true' : 'false'} class={cn('h-auto min-h-9 w-full justify-start gap-2 rounded-md px-2 py-2 text-left text-xs font-normal whitespace-normal hover:shadow-xs', active() === n().name && 'bg-muted')} disabled={blocked()} onClick={() => props.vpn.select(n().name)} size={null} variant="ghost">
                  <span class="w-3.5 shrink-0"><Show when={active() === n().name}><Check class="size-3.5" /></Show></span>
                  <span class="min-w-0 flex-1 break-words">{n().name}</span>
                  <span class="shrink-0 font-mono text-[11px] text-muted-foreground">{props.vpn.nodeDelay(n().name, n().delay) === null ? '—' : `${props.vpn.nodeDelay(n().name, n().delay)} ms`}</span>
                </Button>
              )}
            </For>
            <Show when={provider() && !provider()!.nodes.length}><p class="p-3 text-muted-foreground">В этой подписке нет доступных серверов.</p></Show>
          </div>
        </Show>
      </Show>
      <p aria-label="Ограничения режима Mihomo" class="shrink-0 text-[11px] leading-relaxed text-muted-foreground">Режим не подтверждает защиту IP/DNS. Это не kill switch; настройки общие для всех клиентов.</p>
      <SettingsAccess version={props.vpn.status.data()?.version} />
      <Show when={props.vpn.failure()}>{message => <p class="shrink-0 leading-relaxed text-warning" role="alert">{message()}</p>}</Show>
    </section>
  )
}
