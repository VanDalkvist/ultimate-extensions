/** @jsxImportSource @solidjs/web */
import { Copy, ExternalLink, FileText, Settings } from '@lucide/solid'
import { Show, createSignal } from 'solid-js'
import { Button } from '@/components/ui/button.solid.tsx'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible.solid.tsx'
import { ROOT, actionRef, api, errorMessage, keepLast, useAction, useCopy } from '@/sdk/solid'
import type { SettingsInfo, SettingsPaths } from './settings.ts'
import { canOpenDashboard } from './presentation.ts'

const InfoAction = actionRef<null, SettingsInfo>('vpn', 'settings')
const OpenAction = actionRef<{ file: keyof SettingsPaths }, { dispatched: boolean; path: string }>('vpn', 'openSettings')

function ConfigFile(props: { name: string; file: {path: string; exists: boolean}; open: () => Promise<void>; busy: boolean; available: boolean }) {
  const { copy, copied } = useCopy()
  return (
    <div class="min-w-0 space-y-1">
      <p class="text-[11px] text-muted-foreground">{props.name}</p>
      <div class="flex min-w-0 items-start gap-1">
        <Button aria-label={`Открыть ${props.name} на машине Ultimate`} class="h-auto min-w-0 flex-1 justify-start gap-1.5 p-0 text-left font-mono text-[11px] font-normal whitespace-normal break-all" disabled={!props.file.exists || props.busy || !props.available} onClick={() => props.open()} size={null} variant="link">
          <FileText class="mt-0.5 size-3 shrink-0" />{props.file.path}
        </Button>
        <Button aria-label={`Скопировать путь ${props.name}`} class="h-6 w-6 p-0" onClick={() => copy(props.file.path)} size={null} title={copied() ? 'Путь скопирован' : 'Скопировать путь'} variant="ghost"><Copy class="size-3" /></Button>
      </div>
      <Show when={!props.file.exists}><p class="text-[11px] text-muted-foreground">Файл не найден; путь можно скопировать.</p></Show>
    </div>
  )
}

export function SettingsAccess(props: { version: string | null | undefined }) {
  const info = useAction(InfoAction, null, { conversation: ROOT, onError: keepLast, focus: true })
  const dashboardAvailable = () => canOpenDashboard(info.data()?.dashboardUrl, typeof location === 'undefined' ? '' : location.hostname)
  const [busy, setBusy] = createSignal(false)
  const [message, setMessage] = createSignal<string>()
  const [failed, setFailed] = createSignal(false)
  async function open(file: keyof SettingsPaths) {
    if (busy()) return
    setBusy(true); setMessage(undefined); setFailed(false)
    try {
      await api.action(OpenAction, { file }, { conversationId: ROOT })
      setMessage('Запрос открытия передан в приложение на машине Ultimate.')
    } catch (error) { setFailed(true); setMessage(errorMessage(error)) }
    finally { setBusy(false) }
  }
  return (
    <Collapsible>
      <footer class="shrink-0 border-t border-border/70 pt-2 text-[11px]">
        <div class="flex items-center justify-between gap-1">
          <span class="text-muted-foreground">Mihomo {props.version ?? ''}</span>
          <div class="flex items-center gap-2">
            <Show when={dashboardAvailable() ? info.data()?.dashboardUrl : null} fallback={<Button disabled size={null} variant="link" class="h-6 p-0 text-[11px]">Dashboard</Button>}>
              {url => <Button class="h-6 gap-1 p-0 text-[11px] font-normal" render={linkProps => <a {...linkProps} href={url()} target="_blank" rel="noopener noreferrer" />} size={null} variant="link">Dashboard<ExternalLink class="size-3" /></Button>}
            </Show>
            <CollapsibleTrigger aria-label="Настройки VPN" class="flex h-6 items-center gap-1 rounded-sm px-1 text-muted-foreground hover:bg-accent"><Settings class="size-3" />Настройки</CollapsibleTrigger>
          </div>
        </div>
        <CollapsibleContent class="mt-3 space-y-3">
          <Show when={info.data()} fallback={<p>{info.error() ? 'Не удалось прочитать пути настроек.' : 'Читаю настройки…'}</p>}>
            {data => <>
              <Show when={data().issue}><p class="text-warning">{data().issue}</p></Show>
              <Show when={data().apiUrl}><p class="font-mono text-muted-foreground">API {data().apiUrl} · {data().group}</p></Show>
              <ConfigFile name="Конфигурация Mihomo" file={data().files.daemon} open={() => open('daemon')} busy={busy()} available={data().openerAvailable} />
              <ConfigFile name="Подключение VPN (.env)" file={data().files.connection} open={() => open('connection')} busy={busy()} available={data().openerAvailable} />
              <Show when={data().dashboardUrl && !dashboardAvailable()}><p class="text-warning">Локальный Dashboard недоступен с удалённого устройства. Укажите защищённый MIHOMO_DASHBOARD_URL в .env.</p></Show>
              <Show when={!data().openerAvailable}><p class="text-warning">На этой платформе доступно только копирование пути.</p></Show>
              <p class="text-muted-foreground">Файлы открываются в системном приложении на машине Ultimate. Содержимое и секреты не передаются в браузер.</p>
            </>}
          </Show>
          <Show when={info.error()}><Button class="text-[11px]" onClick={() => info.refetch()} size="sm" variant="outline">Повторить чтение настроек</Button></Show>
          <Show when={message()}>{value => <p class={failed() ? 'text-warning' : 'text-muted-foreground'} role="status">{value()}</p>}</Show>
        </CollapsibleContent>
      </footer>
    </Collapsible>
  )
}
