import { GaugeIcon, PinIcon, RotateCwIcon } from '@lucide/solid'
import { For, Show, createMemo, createSignal, onSettled } from 'solid-js'
import { Button } from '@/components/ui/button.solid.tsx'
import { Toggle } from '@/components/ui/toggle.solid.tsx'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.solid.tsx'
import {
  actionRef,
  api,
  cn,
  defineWebExtension,
  events,
  formatDuration,
  keepLast,
  openPanel,
  useAction,
  useConversations,
  useEvent,
  useNow,
} from '@/sdk/solid'
import type { ProviderId, ProviderUsage, UsageView, UsageWindow } from './types.ts'

const Status = actionRef<null, UsageView>('subscription-usage', 'status')
const Refresh = actionRef<{ provider?: ProviderId; force?: boolean }, UsageView>(
  'subscription-usage',
  'refresh',
)
const Pin = actionRef<{ key: string; on: boolean }, UsageView>('subscription-usage', 'pin')
const changed = () => events.emit('subscription-usage:changed', undefined)
const keyOf = (provider: ProviderUsage, window: UsageWindow) => `${provider.id}.${window.id}`
const stale = (provider: ProviderUsage, now: number) =>
  provider.state !== 'ready' ||
  !provider.fetchedAt ||
  now - provider.fetchedAt > 5 * 60_000 ||
  provider.windows.some((window) => window.resetsAt && Date.parse(window.resetsAt) <= now)
const percent = (value: number) => `${Number(value.toFixed(1))}%`
const shortWindows: Record<string, string> = {
  session: '5h',
  rolling: '5h',
  weekly: 'wk',
  monthly: 'mo',
}
const hintWindows: Record<string, string> = {
  session: '5ч',
  rolling: '5ч',
  weekly: 'неделя',
  monthly: 'месяц',
}
const resetTime = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const tone = (remaining: number) =>
  remaining <= 10 ? 'text-error' : remaining <= 25 ? 'text-warning' : 'text-success'

function useUsage() {
  const conversations = useConversations()
  const answers = createMemo(() =>
    conversations()
      .map(({ id, answerAt, busy }) => `${id}:${answerAt ?? 0}:${busy}`)
      .join(','),
  )
  const [revision, setRevision] = createSignal(0)
  useEvent('subscription-usage:changed', () => setRevision((value) => value + 1))
  return useAction(Status, null, {
    on: () => `${answers()}:${revision()}`,
    focus: true,
    onError: keepLast,
  })
}

function Meter(props: { remaining: number; muted?: boolean }) {
  return (
    <span class="relative block h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <span
        class={cn(
          'absolute inset-y-0 left-0 rounded-full bg-current',
          props.muted ? 'text-muted-foreground/50' : tone(props.remaining),
        )}
        style={{ width: `${props.remaining}%` }}
      />
    </span>
  )
}

function Reset(props: { at?: string; now: number }) {
  const time = () => Date.parse(props.at ?? '')
  const absolute = createMemo(() =>
    Number.isNaN(time()) ? new Date(time()).toLocaleString() : resetTime.format(time()),
  )
  return (
    <Show when={props.at} fallback={<span>Время сброса неизвестно</span>}>
      <span title={absolute()}>
        {time() > props.now
          ? `Сброс через ${formatDuration(time() - props.now)}`
          : 'Ожидает обновления после сброса'}
        <span class="text-muted-foreground/60"> · {absolute()}</span>
      </span>
    </Show>
  )
}

function RefreshButton(props: { provider?: ProviderId; done: () => void }) {
  const [busy, setBusy] = createSignal(false)
  const [failed, setFailed] = createSignal(false)
  const run = async () => {
    setBusy(true)
    setFailed(false)
    try {
      const provider = props.provider
      await api.action(Refresh, { ...(provider ? { provider } : {}), force: true })
      props.done()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button
      aria-label={props.provider ? `Обновить ${props.provider}` : 'Обновить лимиты'}
      class={cn('h-6 shrink-0 gap-1 px-1.5 text-[11px]', failed() && 'text-warning')}
      disabled={busy()}
      onClick={run}
      size="sm"
      title={failed() ? 'Не удалось обновить. Нажмите, чтобы повторить.' : 'Обновить лимиты'}
      variant="ghost"
    >
      <RotateCwIcon class={cn('size-3', busy() && 'animate-spin')} />
      <Show when={!props.provider}>
        <span>{failed() ? 'Повторить' : 'Обновить'}</span>
      </Show>
    </Button>
  )
}

function WindowRow(props: {
  provider: ProviderUsage
  window: UsageWindow
  pinned: boolean
  now: number
}) {
  const [busy, setBusy] = createSignal(false)
  const [failed, setFailed] = createSignal(false)
  const key = () => keyOf(props.provider, props.window)
  const toggle = async (on: boolean) => {
    setBusy(true)
    setFailed(false)
    try {
      await api.action(Pin, { key: key(), on })
      changed()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div class="space-y-1.5" data-usage-window={key()}>
      <div class="flex items-center gap-2 text-[12px]">
        <span class="text-foreground/85">{props.window.label}</span>
        <span class="ml-auto font-mono tabular-nums">
          {percent(props.window.remainingPercent)} осталось
        </span>
        <Toggle
          aria-label={`${props.pinned ? 'Открепить' : 'Закрепить'} ${props.provider.name} ${props.window.label}`}
          class={cn(
            'rounded-sm p-1 transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50 data-pressed:bg-transparent data-pressed:hover:bg-accent',
            props.pinned
              ? 'text-foreground/85 data-pressed:text-foreground/85'
              : 'text-muted-foreground/50',
            failed() && 'text-warning data-pressed:text-warning',
          )}
          disabled={busy()}
          onPressedChange={toggle}
          pressed={props.pinned}
          size={null}
          title={
            failed()
              ? 'Не удалось сохранить. Нажмите, чтобы повторить.'
              : 'Показать в строке статуса'
          }
          variant={null}
        >
          <PinIcon class={cn('size-3', props.pinned && 'fill-current')} />
        </Toggle>
      </div>
      <Meter muted={stale(props.provider, props.now)} remaining={props.window.remainingPercent} />
      <div class="text-[10.5px] leading-relaxed text-muted-foreground">
        <Reset at={props.window.resetsAt} now={props.now} />
      </div>
    </div>
  )
}

function ProviderCard(props: { provider: ProviderUsage; pins: string[]; now: number }) {
  const provider = () => props.provider
  const age = () => Math.max(0, props.now - (provider().fetchedAt ?? props.now))
  return (
    <section
      aria-label={provider().name}
      class="min-w-0 rounded-lg border border-border/70 bg-card/50 p-3"
      data-usage-provider={provider().id}
    >
      <div class="mb-3 flex min-w-0 items-center gap-2">
        <h3 class="min-w-0 truncate text-[13px] font-medium">{provider().name}</h3>
        <Show when={provider().plan}>
          <span class="max-w-24 truncate rounded-sm border border-border/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {provider().plan}
          </span>
        </Show>
        <div class="ml-auto">
          <Show when={!provider().termsUrl}>
            <RefreshButton done={changed} provider={provider().id} />
          </Show>
        </div>
      </div>
      <Show
        when={provider().windows.length > 0}
        fallback={<div class="text-[12px] text-muted-foreground">Нет данных</div>}
      >
        <div class="space-y-4">
          <For each={provider().windows} keyed={(window) => window.id}>
            {(window) => (
              <WindowRow
                now={props.now}
                pinned={props.pins.includes(keyOf(provider(), window()))}
                provider={provider()}
                window={window()}
              />
            )}
          </For>
        </div>
      </Show>
      <Show when={provider().reason}>
        <p
          class={cn(
            'mt-2 text-[11px] leading-relaxed',
            provider().state === 'error' ? 'text-warning' : 'text-muted-foreground',
          )}
        >
          {provider().reason}
        </p>
      </Show>
      <Show when={provider().termsUrl}>
        <a
          class="mt-2 inline-block text-[11px] text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground"
          href={provider().termsUrl}
          rel="noreferrer"
          target="_blank"
        >
          Условия сервиса ↗
        </a>
      </Show>
      <Show when={provider().fetchedAt}>
        <div class="mt-3 border-t border-border/50 pt-2 font-mono text-[10px] text-muted-foreground/70">
          {stale(provider(), props.now) ? 'Устарело' : 'Обновлено'} ·{' '}
          {age() < 60_000 ? 'только что' : `${Math.floor(age() / 60_000)} мин назад`}
          <Show when={provider().source}>
            <span class="block truncate pt-0.5">{provider().source}</span>
          </Show>
        </div>
      </Show>
    </section>
  )
}

function UsagePanel() {
  const usage = useUsage()
  const now = useNow(60_000)
  const [failed, setFailed] = createSignal(false)
  onSettled(() => {
    let active = true
    void api.action(Refresh, {}).then(changed, () => {
      if (active) setFailed(true)
    })
    return () => {
      active = false
    }
  })
  return (
    <div class="space-y-3 p-3" data-subscription-usage="panel">
      <div class="flex items-center justify-between gap-2">
        <h2 class="section-label">Лимиты подписок</h2>
        <RefreshButton
          done={() => {
            setFailed(false)
            changed()
          }}
        />
      </div>
      <p class="text-[11px] leading-relaxed text-muted-foreground">
        Общие для этой машины. Закрепите нужные окна в строке статуса.
      </p>
      <Show when={usage.error() || failed()}>
        <output class="block rounded-md border border-warning/30 bg-warning/5 p-2 text-[11px] text-warning">
          Не удалось прочитать свежие лимиты. Попробуйте обновить.
        </output>
      </Show>
      <Show when={!usage.data() && !usage.error()}>
        <output class="block py-3 font-mono text-[11px] text-muted-foreground">
          Загрузка лимитов…
        </output>
      </Show>
      <For each={usage.data()?.providers} keyed={(provider) => provider.id}>
        {(provider) => (
          <ProviderCard now={now()} pins={usage.data()?.pins ?? []} provider={provider()} />
        )}
      </For>
      <p class="text-[10.5px] leading-relaxed text-muted-foreground/70">
        Обновление после ответов модели и при открытии панели. Кэш — 5 минут, без постоянного
        опроса.
      </p>
    </div>
  )
}

function UsageStrip() {
  const usage = useUsage()
  const now = useNow(60_000)
  const pinned = createMemo(() => {
    const data = usage.data()
    return (
      data?.providers.flatMap((provider) =>
        provider.windows
          .filter((window) => data.pins.includes(keyOf(provider, window)))
          .map((window) => ({ provider, window })),
      ) ?? []
    )
  })
  const hints = createMemo(() => usage.data()?.providers.slice(0, 3))
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label="Открыть лимиты подписок"
        class="flex min-w-0 max-w-52 items-center gap-2 overflow-hidden text-muted-foreground transition-colors hover:text-foreground md:max-w-80"
        data-subscription-usage="strip"
        onClick={() => openPanel('subscription-usage')}
      >
        <GaugeIcon class="size-3 shrink-0" />
        <Show when={pinned().length > 0} fallback={<span>Usage{usage.error() ? ' !' : ' —'}</span>}>
          <span class="flex min-w-0 items-center gap-3 overflow-hidden">
            <For each={pinned()} keyed={({ provider, window }) => keyOf(provider, window)}>
              {(pin) => (
                <span
                  class={cn(
                    'flex shrink-0 items-center gap-1.5',
                    stale(pin().provider, now()) && 'opacity-50',
                  )}
                >
                  <span>{pin().provider.name.replace('OpenCode Go', 'Go')}</span>
                  <span class="hidden w-6 lg:block">
                    <Meter
                      muted={stale(pin().provider, now())}
                      remaining={pin().window.remainingPercent}
                    />
                  </span>
                  <span class="tabular-nums">{percent(pin().window.remainingPercent)}</span>
                  <span class="text-muted-foreground/60">
                    {shortWindows[pin().window.id] ?? pin().window.id}
                  </span>
                </span>
              )}
            </For>
          </span>
        </Show>
      </TooltipTrigger>
      <TooltipContent class="max-w-80 border border-border bg-popover font-mono text-[11px] text-popover-foreground shadow-lg [&_[data-slot=tooltip-arrow]]:bg-popover">
        <div class="space-y-2" data-subscription-usage="tooltip">
          <Show when={hints()} fallback={<span>Загрузка лимитов…</span>}>
            <For each={hints()} keyed={(provider) => provider.id}>
              {(provider) => (
                <div class="grid grid-cols-[6rem_1fr] gap-x-3">
                  <span>{provider().name}</span>
                  <div
                    class={cn(
                      'space-y-1',
                      stale(provider(), now()) && provider().windows.length > 0 && 'opacity-60',
                    )}
                  >
                    <Show when={provider().windows.length} fallback={<span>нет данных</span>}>
                      <For each={provider().windows} keyed={(window) => window.id}>
                        {(window) => (
                          <div class="whitespace-nowrap">
                            {percent(window().remainingPercent)} ·{' '}
                            {hintWindows[window().id] ?? window().label}
                          </div>
                        )}
                      </For>
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </Show>
          <div class="border-t border-current/15 pt-2 opacity-70">
            Осталось · нажмите для деталей
          </div>
          <Show
            when={hints()?.some(
              (provider) => provider.windows.length > 0 && stale(provider, now()),
            )}
          >
            <div class="text-warning">Есть устаревшие данные</div>
          </Show>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

export default defineWebExtension({
  panels: [
    { id: 'subscription-usage', title: 'Usage', icon: GaugeIcon, component: UsagePanel, order: 6 },
  ],
  slots: { 'statusline.left': [{ component: UsageStrip, phone: true, order: -10 }] },
  commands: [
    {
      id: 'subscription-usage.open',
      title: 'Открыть лимиты подписок',
      run: (context) => context.openPanel('subscription-usage'),
    },
  ],
})
