import { useEffect, useState } from 'react'
import { GaugeIcon, PinIcon, RotateCwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  actionRef,
  api,
  cn,
  defineWebExtension,
  events,
  formatDuration,
  keepLast,
  useAction,
  useConversations,
  useEvent,
  useNow,
  useUltimate,
} from '@/sdk'
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
const shortWindow = (id: string) => shortWindows[id] ?? id
const hintWindows: Record<string, string> = {
  session: '5ч',
  rolling: '5ч',
  weekly: 'неделя',
  monthly: 'месяц',
}
const tone = (remaining: number) =>
  remaining <= 10 ? 'text-error' : remaining <= 25 ? 'text-warning' : 'text-success'

function useUsage() {
  const answers = useConversations()
    .map(({ id, answerAt, busy }) => `${id}:${answerAt ?? 0}:${busy}`)
    .join(',')
  const [revision, setRevision] = useState(0)
  useEvent('subscription-usage:changed', () => setRevision((value) => value + 1))
  return useAction(Status, null, { on: `${answers}:${revision}`, focus: true, onError: keepLast })
}

function Meter({ remaining, muted = false }: { remaining: number; muted?: boolean }) {
  return (
    <span className="relative block h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <span
        className={cn(
          'absolute inset-y-0 left-0 rounded-full bg-current',
          muted ? 'text-muted-foreground/50' : tone(remaining),
        )}
        style={{ width: `${remaining}%` }}
      />
    </span>
  )
}

function Reset({ at, now }: { at?: string; now: number }) {
  if (!at) return <span>Время сброса неизвестно</span>
  const time = Date.parse(at)
  const absolute = new Date(time).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return (
    <span title={absolute}>
      {time > now ? `Сброс через ${formatDuration(time - now)}` : 'Ожидает обновления после сброса'}
      <span className="text-muted-foreground/60"> · {absolute}</span>
    </span>
  )
}

function RefreshButton({ provider, done }: { provider?: ProviderId; done: () => void }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const run = async () => {
    setBusy(true)
    setFailed(false)
    try {
      await api.action(Refresh, { ...(provider ? { provider } : {}), force: true })
      done()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button
      aria-label={provider ? `Обновить ${provider}` : 'Обновить лимиты'}
      className={cn('h-6 shrink-0 gap-1 px-1.5 text-[11px]', failed && 'text-warning')}
      disabled={busy}
      onClick={() => void run()}
      size="sm"
      title={failed ? 'Не удалось обновить. Нажмите, чтобы повторить.' : 'Обновить лимиты'}
      variant="ghost"
    >
      <RotateCwIcon className={cn('size-3', busy && 'animate-spin')} />
      {!provider && <span>{failed ? 'Повторить' : 'Обновить'}</span>}
    </Button>
  )
}

function WindowRow({
  provider,
  window,
  pinned,
  now,
}: {
  provider: ProviderUsage
  window: UsageWindow
  pinned: boolean
  now: number
}) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const toggle = async () => {
    setBusy(true)
    setFailed(false)
    try {
      await api.action(Pin, { key: keyOf(provider, window), on: !pinned })
      changed()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-1.5" data-usage-window={keyOf(provider, window)}>
      <div className="flex items-center gap-2 text-[12px]">
        <span className="text-foreground/85">{window.label}</span>
        <span className="ml-auto font-mono tabular-nums">
          {percent(window.remainingPercent)} осталось
        </span>
        <button
          aria-label={`${pinned ? 'Открепить' : 'Закрепить'} ${provider.name} ${window.label}`}
          aria-pressed={pinned}
          className={cn(
            'rounded-sm p-1 transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50',
            pinned ? 'text-foreground/85' : 'text-muted-foreground/50',
            failed && 'text-warning',
          )}
          disabled={busy}
          onClick={() => void toggle()}
          title={
            failed ? 'Не удалось сохранить. Нажмите, чтобы повторить.' : 'Показать в строке статуса'
          }
          type="button"
        >
          <PinIcon className={cn('size-3', pinned && 'fill-current')} />
        </button>
      </div>
      <Meter muted={stale(provider, now)} remaining={window.remainingPercent} />
      <div className="text-[10.5px] leading-relaxed text-muted-foreground">
        <Reset at={window.resetsAt} now={now} />
      </div>
    </div>
  )
}

function ProviderCard({
  provider,
  pins,
  now,
}: {
  provider: ProviderUsage
  pins: string[]
  now: number
}) {
  const old = stale(provider, now)
  const age = provider.fetchedAt ? Math.max(0, now - provider.fetchedAt) : undefined
  return (
    <section
      aria-label={provider.name}
      className="min-w-0 rounded-lg border border-border/70 bg-card/50 p-3"
      data-usage-provider={provider.id}
    >
      <div className="mb-3 flex min-w-0 items-center gap-2">
        <h3 className="min-w-0 truncate text-[13px] font-medium">{provider.name}</h3>
        {provider.plan && (
          <span className="max-w-24 truncate rounded-sm border border-border/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {provider.plan}
          </span>
        )}
        <div className="ml-auto">
          {!provider.termsUrl && <RefreshButton done={changed} provider={provider.id} />}
        </div>
      </div>
      {provider.windows.length > 0 ? (
        <div className="space-y-4">
          {provider.windows.map((window) => (
            <WindowRow
              key={window.id}
              now={now}
              pinned={pins.includes(keyOf(provider, window))}
              provider={provider}
              window={window}
            />
          ))}
        </div>
      ) : (
        <div className="text-[12px] text-muted-foreground">Нет данных</div>
      )}
      {provider.reason && (
        <p
          className={cn(
            'mt-2 text-[11px] leading-relaxed',
            provider.state === 'error' ? 'text-warning' : 'text-muted-foreground',
          )}
        >
          {provider.reason}
        </p>
      )}
      {provider.termsUrl && (
        <a
          className="mt-2 inline-block text-[11px] text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground"
          href={provider.termsUrl}
          rel="noreferrer"
          target="_blank"
        >
          Условия сервиса ↗
        </a>
      )}
      {age !== undefined && (
        <div className="mt-3 border-t border-border/50 pt-2 font-mono text-[10px] text-muted-foreground/70">
          {old ? 'Устарело' : 'Обновлено'} ·{' '}
          {age < 60_000 ? 'только что' : `${Math.floor(age / 60_000)} мин назад`}
          {provider.source && <span className="block truncate pt-0.5">{provider.source}</span>}
        </div>
      )}
    </section>
  )
}

function UsagePanel() {
  const usage = useUsage()
  const now = useNow(60_000)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    void api.action(Refresh, {}).then(changed, () => {
      if (active) setFailed(true)
    })
    return () => {
      active = false
    }
  }, [])
  return (
    <div className="space-y-3 p-3" data-subscription-usage="panel">
      <div className="flex items-center justify-between gap-2">
        <h2 className="section-label">Лимиты подписок</h2>
        <RefreshButton
          done={() => {
            setFailed(false)
            changed()
          }}
        />
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Общие для этой машины. Закрепите нужные окна в строке статуса.
      </p>
      {(usage.error || failed) && (
        <div
          className="rounded-md border border-warning/30 bg-warning/5 p-2 text-[11px] text-warning"
          role="status"
        >
          Не удалось прочитать свежие лимиты. Попробуйте обновить.
        </div>
      )}
      {!usage.data && !usage.error && (
        <div className="py-3 font-mono text-[11px] text-muted-foreground" role="status">
          Загрузка лимитов…
        </div>
      )}
      {usage.data?.providers.map((provider) => (
        <ProviderCard
          key={provider.id}
          now={now}
          pins={usage.data?.pins ?? []}
          provider={provider}
        />
      ))}
      <p className="text-[10.5px] leading-relaxed text-muted-foreground/70">
        Обновление после ответов модели и при открытии панели. Кэш — 5 минут, без постоянного
        опроса.
      </p>
    </div>
  )
}

function UsageStrip() {
  const usage = useUsage()
  const { openPanel } = useUltimate()
  const now = useNow(60_000)
  const pinned =
    usage.data?.providers.flatMap((provider) =>
      provider.windows
        .filter((window) => usage.data?.pins.includes(keyOf(provider, window)))
        .map((window) => ({ provider, window })),
    ) ?? []
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label="Открыть лимиты подписок"
          className="flex min-w-0 max-w-52 items-center gap-2 overflow-hidden text-muted-foreground transition-colors hover:text-foreground md:max-w-80"
          data-subscription-usage="strip"
          onClick={() => openPanel('subscription-usage')}
          type="button"
        >
          <GaugeIcon className="size-3 shrink-0" />
          {pinned.length ? (
            <span className="flex min-w-0 items-center gap-3 overflow-hidden">
              {pinned.map(({ provider, window }) => (
                <span
                  className={cn(
                    'flex shrink-0 items-center gap-1.5',
                    stale(provider, now) && 'opacity-50',
                  )}
                  key={keyOf(provider, window)}
                >
                  <span>{provider.name.replace('OpenCode Go', 'Go')}</span>
                  <span className="hidden w-6 lg:block">
                    <Meter muted={stale(provider, now)} remaining={window.remainingPercent} />
                  </span>
                  <span className="tabular-nums">{percent(window.remainingPercent)}</span>
                  <span className="text-muted-foreground/60">{shortWindow(window.id)}</span>
                </span>
              ))}
            </span>
          ) : (
            <span>Usage{usage.error ? ' !' : ' —'}</span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-80 border border-border bg-popover font-mono text-[11px] text-popover-foreground shadow-lg [&_svg]:bg-popover [&_svg]:fill-popover">
        <div className="space-y-2" data-subscription-usage="tooltip">
          {usage.data?.providers.slice(0, 3).map((provider) => (
            <div className="grid grid-cols-[6rem_1fr] gap-x-3" key={provider.id}>
              <span>{provider.name}</span>
              <div
                className={cn(
                  'space-y-1',
                  stale(provider, now) && provider.windows.length > 0 && 'opacity-60',
                )}
              >
                {provider.windows.length ? (
                  provider.windows.map((window) => (
                    <div className="whitespace-nowrap" key={window.id}>
                      {percent(window.remainingPercent)} · {hintWindows[window.id] ?? window.label}
                    </div>
                  ))
                ) : (
                  <span>нет данных</span>
                )}
              </div>
            </div>
          )) ?? <span>Загрузка лимитов…</span>}
          <div className="border-t border-current/15 pt-2 opacity-70">
            Осталось · нажмите для деталей
          </div>
          {usage.data?.providers
            .slice(0, 3)
            .some((provider) => provider.windows.length > 0 && stale(provider, now)) && (
            <div className="text-warning">Есть устаревшие данные</div>
          )}
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
