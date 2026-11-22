import type { ConversationId } from '@earendil-works/pi-durable'
import terminalCss from '@wterm/dom/css?inline'
import type { WTerm } from '@wterm/dom'
import { GhosttyCore } from '@wterm/ghostty'
import wasmUrl from '@wterm/ghostty/ghostty-vt.wasm?url'
import { Terminal as TerminalIcon } from '@lucide/solid'
import { Show, createEffect, createSignal, onSettled } from 'solid-js'
import { Button } from '@/components/ui/button.solid.tsx'
import { Tool, ToolContent, ToolHeader, ToolOutput } from '@/components/ai/tool.solid.tsx'
import {
  actionRef, ActionError, api, attention, Card, defineWebExtension,
  Header, Sidebar, StatusLine, showSurface, useAction,
  useConversationId, useExtensionUiState,
  type SolidToolProps, type ToolCallView,
} from '@/sdk/solid'
import { settled } from './errors.ts'
import { terminalViewLifecycle } from './lifecycle.ts'
import { readWithRetry } from './read-retry.ts'
import { shellLaunch, shellOpenIntent } from './shell-launch.ts'
import { TerminalFind, TerminalAgentSelection, TerminalShellPicker } from './terminal-controls.solid.tsx'
import { TerminalEmulator } from './terminal-emulator.solid.tsx'
import type { ShellCatalog } from './shells.ts'
import './web.css'

type Grant = { conversation: ConversationId; expires: number; generation: string }
type Metadata = { sessionId: string; owner: 'user' | 'agent'; grant: Grant | null }
type Opened = Metadata & {
  secretToken: string
  secretReplay?: string
  pid: number
  cwd: string
  shell: string
  cols: number
  rows: number
  cursor: number
}
type Reply = {
  secretOutput: string
  cursor: number
  ended: boolean
  reason: 'output-incomplete' | null
} & Metadata
type Control = { secretInput?: string; cols?: number; rows?: number }

const Open = actionRef<{ cols: number; rows: number; shell: string }, Opened>('terminal', 'open')
const Shells = actionRef<Record<string, never>, ShellCatalog>('terminal', 'shells')
const Read = actionRef<{ secretToken: string; cursor: number; ack?: true }, Reply>('terminal', 'read')
const ControlAction = actionRef<Control & { secretToken: string }, { ok: boolean }>('terminal', 'control')
const Inspect = actionRef<Record<string, never>, Opened | null>('terminal', 'inspect')
const GrantAction = actionRef<{ secretToken: string; conversation: ConversationId }, Metadata>('terminal', 'grant')
const Revoke = actionRef<{ secretToken: string }, Metadata>('terminal', 'revoke')
const Approval = actionRef<{ requestId: string }, { available: boolean }>('terminal', 'approval')
const Approve = actionRef<{ requestId: string; shell: string }, Metadata & { conversation: ConversationId }>('terminal', 'approve')
const Deny = actionRef<{ requestId: string }, { conversation: ConversationId }>('terminal', 'deny')
const Close = actionRef<{ secretToken: string }, { ok: boolean }>('terminal', 'close')

type Running = Opened & {
  abort: AbortController
  queue: Promise<unknown>
  pending: number
  count: number
}
const closeShell = (secretToken: string) =>
  api.action(Close, { secretToken }, { keepalive: true })

const openIntent = shellOpenIntent()

function OpenShellButton() {
  const [routeRequest, setRouteRequest] = createSignal(0)
  createEffect(() => routeRequest(), (count) => {
    if (count) openIntent.routeCommitted()
  })
  onSettled(() => {
    window.addEventListener('pagehide', openIntent.clear)
    return () => window.removeEventListener('pagehide', openIntent.clear)
  })
  return (
    <Button class="h-6 shrink-0 gap-1.5 px-2 font-mono text-[11px]"
      size="sm" variant="outline"
      title="Open a host shell with full OS user privileges"
      onClick={(event) => {
        if (!event.isTrusted) return
        openIntent.request(() => {
          showSurface('terminal')
          setRouteRequest((count) => count + 1)
        })
      }}
    ><TerminalIcon class="size-3.5 max-md:hidden" />Open shell</Button>
  )
}

function TerminalSurface() {
  const conversation = useConversationId()
  const [defaultShell, setDefaultShell] = useExtensionUiState<string>('default-shell', 'system')
  const detected = useAction(Shells, {})
  const shellAvailable = () => {
    const catalog = detected.data()
    return !!catalog?.shells.length && (defaultShell() === 'system' ||
      catalog.shells.some((shell) => shell.path === defaultShell()))
  }
  const [access, setAccess] = createSignal<Metadata>()
  const [core, setCore] = createSignal<GhosttyCore>()
  const [state, setState] = createSignal('Loading terminal…')
  const [error, setError] = createSignal(false)
  const [opened, setOpened] = createSignal<Opened>()
  const [ready, setReady] = createSignal(false)
  const [launching, setLaunching] = createSignal(false)
  const [changingGrant, setChangingGrant] = createSignal(false)
  const [terminalInstance, setTerminalInstance] = createSignal<WTerm | null>(null)
  let running: Running | null = null
  let mounted = false
  let grantInFlight = false

  const lifecycle = terminalViewLifecycle({
    take() {
      const session = running
      running = null
      return session
    },
    close: closeShell,
    changed(next, failure) {
      if (!mounted) return
      setOpened(undefined)
      setState(next)
      setError(failure)
    },
  })
  const { stop, leave, pagehide, failed } = lifecycle

  function control(args: Control): Promise<void> {
    const session = running
    if (!session) return Promise.reject(new Error('Terminal stopped'))
    const size = args.secretInput?.length ?? 0
    session.pending += size
    session.count++
    if (session.pending > 64 * 1024 || session.count > 128) {
      failed()
      return Promise.reject(new Error('Terminal stopped'))
    }
    const next = session.queue.then(async () => {
      if (running !== session) throw new Error('Terminal stopped')
      await api.action(
        ControlAction, { ...args, secretToken: session.secretToken },
        { signal: session.abort.signal },
      )
    }).finally(() => {
      session.pending -= size
      session.count--
    })
    session.queue = next
    // A write may already have reached the PTY when the request fails: never retry.
    void next.catch(() => {
      if (running === session) failed()
    })
    return next
  }
  function input(bytes: Uint8Array) {
    if (!running) return
    if (bytes.length > 8192) { failed(); return }
    void settled(control({ secretInput: btoa(String.fromCharCode(...bytes)) }))
  }
  async function run(value: Opened, terminal: WTerm, existing: boolean) {
    const session: Running = {
      ...value,
      abort: new AbortController(),
      queue: Promise.resolve(),
      pending: 0,
      count: 0,
    }
    running = session
    try {
      if (existing) await control({ cols: terminal.cols, rows: terminal.rows })
      if (running !== session) return
      setOpened(value)
      setAccess(value)
      setState('Running')
      if (existing && value.secretReplay) {
        terminal.write(Uint8Array.from(atob(value.secretReplay), (char) => char.charCodeAt(0)))
      }
      terminal.focus()
      let cursor = value.cursor
      while (running === session) {
        const result = await readWithRetry(
          () => api.action(
            Read,
            {
              secretToken: session.secretToken,
              cursor,
              ack: cursor > value.cursor ? true : undefined,
            },
            { signal: session.abort.signal },
          ),
          session.abort.signal,
        )
        if (running !== session) break
        setAccess(result)
        terminal.write(Uint8Array.from(atob(result.secretOutput), (char) => char.charCodeAt(0)))
        cursor = result.cursor
        if (result.ended) {
          leave()
          setState('Stopped')
          setError(result.reason === 'output-incomplete')
          if (result.reason === 'output-incomplete') setState('Terminal stopped · output incomplete')
          break
        }
      }
    } catch (cause) {
      if (running === session) {
        failed(
          cause instanceof ActionError && cause.action === 'read'
            ? cause.status === 0
              ? 'connection to shell lost while reading'
              : 'shell output request rejected'
            : undefined,
        )
      }
    }
  }

  const launch = shellLaunch<WTerm, Opened>({
    inspect: () => api.action(Inspect, {}),
    open: (size) => api.action(Open, { ...size, shell: defaultShell() }),
    close: closeShell,
    running: () => running !== null,
    busy: setLaunching,
    changed(next, failure = false) { setState(next); setError(failure) },
    attach: (value, terminal, existing) => void run(value, terminal, existing),
  })

  onSettled(() => {
    mounted = true
    launch.connect()
    const disconnectIntent = openIntent.connect(launch.request)
    const hide = () => { launch.hide(); pagehide() }
    window.addEventListener('pagehide', hide)
    window.addEventListener('pageshow', launch.show)
    let active = true
    let loaded: GhosttyCore | undefined
    void GhosttyCore.load({ wasmPath: wasmUrl, scrollbackLines: 1000, imageStorageLimit: 0 })
      .then((value) => {
        if (!active) { value.dispose(); return }
        loaded = value
        setCore(value)
      })
      .catch(() => {
        if (!active) return
        launch.invalidate()
        setError(true)
        setState('Terminal could not load')
      })
    return () => {
      active = false
      mounted = false
      disconnectIntent()
      launch.disconnect()
      leave()
      window.removeEventListener('pagehide', hide)
      window.removeEventListener('pageshow', launch.show)
      loaded?.dispose()
    }
  })

  async function toggleGrant() {
    const session = opened()
    if (!session || grantInFlight) return
    const recipient = conversation()
    if (!access()?.grant && recipient === undefined) return
    grantInFlight = true
    setChangingGrant(true)
    try {
      const updated = access()?.grant
        ? await api.action(Revoke, { secretToken: session.secretToken })
        : await api.action(GrantAction, {
            secretToken: session.secretToken,
            conversation: recipient!,
          })
      setAccess(updated)
      setError(false)
      setState('Running')
    } catch {
      try {
        const current = await api.action(Inspect, {})
        if (current?.sessionId === session.sessionId) setAccess(current)
      } catch { /* do not terminate the active PTY */ }
      setState('Shell access change unconfirmed · inspect status before retrying')
      setError(true)
    } finally {
      grantInFlight = false
      setChangingGrant(false)
    }
  }

  return (
    <>
      <div class="flex min-h-0 flex-1">
        <Sidebar />
        <main class="flex min-w-0 flex-1 flex-col"
          data-terminal-state={opened() ? 'running' : state()}
          data-terminal-pid={opened()?.pid}>
          <Header>
            <span class="flex items-center gap-2 text-[13px] font-medium">
              <TerminalIcon class="size-4 text-muted-foreground" />Terminal
            </span>
          </Header>
          <div class="terminal-toolbar border-b border-border/70">
            <TerminalShellPicker catalog={detected.data} value={defaultShell}
              runningShell={() => opened()?.shell} onChange={setDefaultShell} />
            <span class="terminal-session-indicator"
              title={opened()
                ? 'PID ' + opened()!.pid + ' · full OS user privileges · ' +
                  (opened()!.owner === 'agent' ? '30-second renewable lease' : '10-minute maximum')
                : 'Shell starts only on request and has full OS user privileges'}>
              <span class={opened() ? 'terminal-dot terminal-dot-on' : 'terminal-dot'} />
              {opened() ? 'Running' : 'Ready'}
            </span>
            <span class="terminal-project-path" title={opened()?.cwd ?? 'Project directory'}>
              {opened()?.cwd ?? 'Project directory'}
            </span>
            <div class="terminal-toolbar-actions">
              <TerminalFind instance={terminalInstance} />
              <TerminalAgentSelection instance={terminalInstance} conversation={conversation} />
              <Show when={opened()}>
                <Button size="sm" variant="outline" title="Grant or revoke full read/write access to this OS shell"
                  disabled={changingGrant() || (!access()?.grant && conversation() === undefined)}
                  onClick={() => void toggleGrant()}>
                  {changingGrant() ? 'Updating…'
                    : access()?.grant ? 'Revoke control' : 'Grant control · 5m'}
                </Button>
              </Show>
              <Button size="sm" variant="outline"
                disabled={!opened() && (!ready() || launching() || !shellAvailable())}
                onClick={(event) => {
                  if (opened()) stop()
                  else if (event.isTrusted) launch.request()
                }}
              >{opened() ? 'Stop' : 'Start shell'}</Button>
            </div>
          </div>
          <Show when={error()}>
            <div class="terminal-message-error" role="alert">{state()}</div>
          </Show>
          <Show when={!opened() && !error()}>
            <div class="terminal-idle-hint" role="status">
              {!detected.loading() && !shellAvailable()
                ? 'No valid default shell · choose an installed shell above'
                : 'New sessions open in the project directory · full OS access · 10-minute maximum'}
            </div>
          </Show>
          <Show when={core()}>
            {(loaded) => (
              <TerminalEmulator core={loaded()}
                onReady={(terminal) => {
                  setReady(true)
                  setTerminalInstance(terminal)
                  launch.ready(terminal)
                }}
                onResize={(cols, rows) => {
                  if (running) void settled(control({ cols, rows }))
                }}
                onData={(value) => input(new TextEncoder().encode(value))}
                onBinary={input}
                onError={() => {
                  setTerminalInstance(null)
                  launch.invalidate()
                  setReady(false)
                  failed()
                }}
              />
            )}
          </Show>
        </main>
      </div>
      <style>{terminalCss}</style>
      <StatusLine />
    </>
  )
}

type TerminalDetails = {
  state?: string
  requestId?: string
  conversation?: ConversationId
  cwd?: string
  sessionId?: string
  secretOutput?: string
  truncated?: boolean
}
function ApprovalCard(props: { requestId: string; details: TerminalDetails }) {
  const [defaultShell, setDefaultShell] = useExtensionUiState<string>('default-shell', 'system')
  const shells = useAction(Shells, {})
  const validShell = () => {
    const catalog = shells.data()
    return !!catalog?.shells.length &&
      (defaultShell() === 'system' || catalog.shells.some((shell) => shell.path === defaultShell()))
  }
  const available = useAction(Approval, { requestId: props.requestId }, { every: 1000 })
  const [choice, setChoice] = createSignal('')
  const [canOpen, setCanOpen] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  let inFlight = false

  async function decide(approve: boolean) {
    if (inFlight || choice() || (approve && !validShell())) return
    inFlight = true
    setBusy(true)
    try {
      if (approve) {
        setCanOpen(true)
        const result = await api.action(Approve, { requestId: props.requestId, shell: defaultShell() })
        setChoice('Approved · session ' + result.sessionId)
        try {
          await api.submit(
            'Terminal launch approved. Session ' + result.sessionId +
              '. Call terminal status for your grant generation.',
            'followUp',
            result.conversation,
          )
        } catch {
          setChoice('Shell started · session ' + result.sessionId +
            ' · continuation not delivered. Do not approve again.')
        }
      } else {
        const result = await api.action(Deny, { requestId: props.requestId })
        setChoice('Denied · no shell started')
        try {
          await api.submit('Terminal launch denied. No shell was started.', 'followUp', result.conversation)
        } catch {
          setChoice('Denied · no shell started · continuation not delivered')
        }
      }
    } catch {
      setChoice(approve
        ? 'Shell may have started; continuation not sent; do not retry approval.'
        : 'Unavailable · deny request expired, handled or reloaded')
    } finally {
      inFlight = false
      setBusy(false)
    }
  }
  return (
    <Card attention={!choice() && available.data()?.available}
      class="space-y-2 p-3 text-[12px]" data-terminal-approval={props.requestId}>
      <p class="font-medium">Terminal · launch approval for #{props.details.conversation}</p>
      <p class="font-mono text-[11px] text-muted-foreground">
        {props.details.cwd} · request {props.requestId}
      </p>
      <p>
        Full OS user privileges. Approving creates one agent-owned shell and lets
        this conversation read, write and close it for five minutes. No command sandbox.
      </p>
      <div class="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>Shell for this session</span>
        <TerminalShellPicker catalog={shells.data} value={defaultShell}
          runningShell={() => undefined} onChange={setDefaultShell} />
      </div>
      <Show when={!shells.loading() && !validShell()}>
        <p class="text-[12px] text-error" role="alert">
          Choose an installed shell before approving this request.
        </p>
      </Show>
      <Show when={choice()} fallback={
        <Show when={available.data()?.available} fallback={
          <p class="text-muted-foreground" role="status">
            {available.loading() ? 'Checking request…' :
              'Unavailable · request expired, handled or reloaded'}
          </p>
        }>
          <div class="flex gap-2">
            <Button size="sm" disabled={busy() || !validShell()} onClick={() => void decide(true)}>Approve &amp; continue</Button>
            <Button size="sm" variant="outline" disabled={busy()} onClick={() => void decide(false)}>Deny</Button>
          </div>
        </Show>
      }><p role="status">{choice()}</p></Show>
      <Show when={canOpen()}>
        <Button size="sm" variant="outline" onClick={() => showSurface('terminal')}>Open terminal</Button>
      </Show>
    </Card>
  )
}

function TerminalTool(props: SolidToolProps) {
  const details = () => props.call.details as TerminalDetails | undefined
  const requestId = () => details()?.state === 'pending' ? details()?.requestId : undefined
  const openTerminal = (
    <Button size="sm" variant="outline" onClick={() => showSurface('terminal')}>
      Открыть терминал
    </Button>
  )
  return (
    <Show when={requestId()} fallback={
      <Tool defaultOpen={!!details()?.secretOutput}>
        <ToolHeader name="terminal" action={openTerminal} state={props.call.status}
          title={String(props.call.args.action ?? '') + ' · ' + (details()?.state ?? 'working')} />
        <ToolContent>
          <Show when={details()?.sessionId}>
            <p class="p-2 font-mono text-[11px] text-muted-foreground">{details()?.sessionId}</p>
          </Show>
          <Show when={details()?.truncated}>
            <p class="p-2 text-warning">Earlier output truncated</p>
          </Show>
          <Show when={details()?.secretOutput}>
            <ToolOutput output={details()?.secretOutput ?? ''} />
          </Show>
        </ToolContent>
      </Tool>
    }>
      {(request) => <ApprovalCard requestId={request()} details={details() ?? {}} />}
    </Show>
  )
}

export default defineWebExtension({
  slots: { 'titlebar.right': [OpenShellButton] },
  tools: { terminal: attention(TerminalTool) },
  surfaces: [
    { id: 'terminal', title: 'Terminal', icon: TerminalIcon,
      description: 'Real local shell with explicit access and agent context',
      order: 81, component: TerminalSurface },
  ],
})
