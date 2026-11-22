import { settled } from '../../../lib/errors.ts'
import type { ConversationId } from '@earendil-works/pi-durable'
import terminalCss from '@wterm/dom/css?inline'
import { GhosttyCore } from '@wterm/ghostty'
import wasmUrl from '@wterm/ghostty/ghostty-vt.wasm?url'
import { WTerm } from '@wterm/dom'
import { Terminal as TerminalIcon } from '@lucide/solid'
import { createEffect, createSignal, onSettled, Show } from 'solid-js'
import { Button } from '@/components/ui/button.solid.tsx'
import {
  actionRef,
  ActionError,
  api,
  attention,
  Card,
  defineWebExtension,
  Header,
  showSurface,
  Sidebar,
  StatusLine,
  useAction,
  useConversationId,
  writerNow,
} from '@/sdk/solid'
import type { SolidToolProps } from '@/sdk/solid'
import { AnsiOutput } from '@/components/ai/ansi-output.solid.tsx'
import { Tool, ToolHeader, ToolContent } from '@/components/ai/tool.solid.tsx'
import { terminalViewLifecycle } from './lifecycle.solid.tsx'
import { readWithRetry } from './read-retry.solid.tsx'
import { shellLaunch, shellOpenIntent } from './shell-launch.solid.tsx'
import './web.css'

type Grant = { conversation: ConversationId; expires: number; generation: string }
type Metadata = { sessionId: string; owner: 'user' | 'agent'; grant: Grant | null }
type Opened = Metadata & {
  secretToken: string
  pid: number
  cwd: string
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
type Control = {
  secretInput?: string
  cols?: number
  rows?: number
}
const Open = actionRef<{ cols: number; rows: number }, Opened>('terminal', 'open')
const Read = actionRef<{ secretToken: string; cursor: number; ack?: true }, Reply>(
  'terminal',
  'read',
)
const ControlAction = actionRef<Control & { secretToken: string }, { ok: boolean }>(
  'terminal',
  'control',
)
const Inspect = actionRef<Record<string, never>, Opened | null>('terminal', 'inspect')
const GrantAction = actionRef<{ secretToken: string; conversation: ConversationId }, Metadata>(
  'terminal',
  'grant',
)
const Revoke = actionRef<{ secretToken: string }, Metadata>('terminal', 'revoke')
const Approval = actionRef<{ requestId: string }, { available: boolean }>('terminal', 'approval')
const Approve = actionRef<{ requestId: string }, Metadata & { conversation: ConversationId }>(
  'terminal',
  'approve',
)
const Deny = actionRef<{ requestId: string }, { conversation: ConversationId }>('terminal', 'deny')
const Close = actionRef<{ secretToken: string }, { ok: boolean }>('terminal', 'close')
type Running = Opened & {
  abort: AbortController
  queue: Promise<unknown>
  pending: number
  count: number
}

function closeShell(secretToken: string) {
  return api.action(Close, { secretToken }, { keepalive: true })
}

export function changeShellGrant(
  secretToken: string,
  grant: Grant | null | undefined,
  selected: ConversationId | undefined,
) {
  if (grant) return api.action(Revoke, { secretToken })
  if (selected) return api.action(GrantAction, { secretToken, conversation: selected })
  return undefined
}

const openIntent = shellOpenIntent()

function trustedPerson(event: MouseEvent) {
  return event.isTrusted && writerNow() === 'person'
}

function OpenShellButton() {
  const [routeRequest, setRouteRequest] = createSignal(0)
  createEffect(routeRequest, (request) => {
    if (request) openIntent.routeCommitted()
  })
  onSettled(() => {
    window.addEventListener('pagehide', openIntent.clear)
    return () => {
      openIntent.clear()
      window.removeEventListener('pagehide', openIntent.clear)
    }
  })
  return (
    <Button
      class="h-6 shrink-0 gap-1.5 px-2 font-mono text-[11px]"
      size="sm"
      variant="outline"
      title="Open a shell with full OS user privileges"
      data-agent-confirm="Opens a shell with full OS user privileges."
      onClick={(event) => {
        if (!trustedPerson(event)) return
        openIntent.request(() => {
          showSurface('terminal')
          setRouteRequest((count) => count + 1)
        })
      }}
    >
      <TerminalIcon class="size-3.5 max-md:hidden" />
      Open shell
    </Button>
  )
}

function TerminalSurface() {
  const conversation = useConversationId()
  const [access, setAccess] = createSignal<Metadata>()
  const [state, setState] = createSignal('Loading terminal…')
  const [error, setError] = createSignal(false)
  const [opened, setOpened] = createSignal<Opened>()
  const [ready, setReady] = createSignal(false)
  const [launching, setLaunching] = createSignal(false)
  let container!: HTMLElement
  let running: Running | null = null
  let mounted = false

  const { stop, leave, failed } = terminalViewLifecycle({
    take() {
      const session = running
      running = null
      return session
    },
    close: closeShell,
    changed(nextState, nextError) {
      if (mounted) {
        setOpened(undefined)
        setState(nextState)
        setError(nextError)
      }
    },
  })

  async function toggleGrant(event: MouseEvent) {
    const session = running
    if (!trustedPerson(event) || !session) return
    try {
      const change = changeShellGrant(session.secretToken, access()?.grant, conversation())
      if (!change) return
      const next = await change
      if (running === session) setAccess(next)
    } catch {
      if (running === session) failed()
    }
  }

  function control(args: Control) {
    const s = running
    if (!s) return Promise.reject(new Error('Terminal stopped'))
    const size = args.secretInput?.length ?? 0
    s.pending += size
    s.count++
    if (s.pending > 64 * 1024 || s.count > 128) {
      failed()
      return Promise.reject(new Error('Terminal stopped'))
    }
    const next = s.queue
      .then(async () => {
        if (running !== s) throw new Error('Terminal stopped')
        await api.action(
          ControlAction,
          { ...args, secretToken: s.secretToken },
          { signal: s.abort.signal },
        )
      })
      .finally(() => {
        s.pending -= size
        s.count--
      })
    s.queue = next
    // No retries: an interrupted action may already have applied its input.
    void next.catch(() => {
      if (running === s) failed()
    })
    return next
  }
  function input(bytes: Uint8Array) {
    if (!running) return
    if (bytes.length > 8192) {
      failed()
      return
    }
    void settled(control({ secretInput: btoa(String.fromCharCode(...bytes)) }))
  }
  async function run(value: Opened, terminal: WTerm, existing: boolean) {
    const s: Running = {
      ...value,
      abort: new AbortController(),
      queue: Promise.resolve(),
      pending: 0,
      count: 0,
    }
    running = s
    try {
      if (existing) await control({ cols: terminal.cols, rows: terminal.rows })
      if (running !== s) return
      setOpened(value)
      setAccess(value)
      setState('Running')
      terminal.focus()
      let cursor = value.cursor
      while (!s.abort.signal.aborted) {
        const result = await readWithRetry(
          () =>
            api.action(
              Read,
              { secretToken: s.secretToken, cursor, ack: cursor > value.cursor ? true : undefined },
              { signal: s.abort.signal },
            ),
          s.abort.signal,
        )
        if (running !== s) break
        setAccess(result)
        const bytes = Uint8Array.from(atob(result.secretOutput), (char) => char.charCodeAt(0))
        terminal.write(bytes)
        cursor = result.cursor
        if (result.ended) {
          leave()
          setState('Stopped')
          setError(false)
          if (result.reason === 'output-incomplete') {
            setError(true)
            setState('Terminal stopped · output incomplete')
          }
          break
        }
      }
    } catch (cause) {
      if (running === s) {
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
    open: (size) => api.action(Open, size),
    close: closeShell,
    running: () => running !== null,
    busy: setLaunching,
    changed(next, failure = false) {
      setState(next)
      setError(failure)
    },
    attach: (value, terminal, existing) => void run(value, terminal, existing),
  })

  onSettled(() => {
    mounted = true
    const disconnectIntent = openIntent.connect(launch.request)
    function hide() {
      launch.hide()
      leave()
    }
    window.addEventListener('pagehide', hide)
    window.addEventListener('pageshow', launch.show)

    let core: GhosttyCore | undefined
    let terminal: WTerm | undefined
    async function initialize() {
      const loaded = await GhosttyCore.load({
        wasmPath: wasmUrl,
        scrollbackLines: 1000,
        imageStorageLimit: 0,
      })
      if (!mounted) {
        loaded.dispose()
        return
      }
      core = loaded
      const view = new WTerm(container, {
        cols: 80,
        rows: 24,
        core,
        autoResize: true,
        renderer: 'dom',
        webmcp: false,
        debug: false,
        onResize: (cols, rows) => {
          if (running) void settled(control({ cols, rows }))
        },
        onData: (text) => input(new TextEncoder().encode(text)),
        onBinary: input,
      })
      terminal = view
      await view.init()
      if (!mounted) return
      setReady(true)
      launch.ready(view)
    }
    void initialize().catch(() => {
      if (!mounted) return
      launch.invalidate()
      if (terminal) failed()
      else {
        setError(true)
        setState('Terminal could not load')
      }
    })

    return () => {
      mounted = false
      disconnectIntent()
      launch.disconnect()
      leave()
      window.removeEventListener('pagehide', hide)
      window.removeEventListener('pageshow', launch.show)
      terminal?.destroy()
      core?.dispose()
    }
  })

  return (
    <>
      <div class="flex min-h-0 flex-1">
        <Sidebar />
        <main
          class="flex min-w-0 flex-1 flex-col"
          data-terminal-state={opened() ? 'running' : state()}
          data-terminal-pid={opened()?.pid}
        >
          <Header>
            <span class="flex items-center gap-2 text-[13px] font-medium">
              <TerminalIcon class="size-4 text-muted-foreground" />
              Terminal
            </span>
          </Header>
          <div class="terminal-toolbar flex items-center gap-3 border-b border-border/70 px-3 py-2">
            <div class="terminal-summary min-w-0 flex-1 text-[11px] text-muted-foreground">
              <p class="truncate font-mono">
                {opened()?.cwd ?? 'Fixed project directory · /bin/bash --noprofile --norc -i'}
              </p>
              <p>
                Full OS user privileges · 10 minute trial · leaving detaches agent-owned shells;
                user-owned shells stop
              </p>
            </div>
            <Show when={opened()}>
              <Button
                size="sm"
                variant="outline"
                disabled={!access()?.grant && !conversation()}
                data-agent-confirm={
                  access()?.grant
                    ? 'Revokes agent access to this shell.'
                    : 'Grants this conversation access to the shell for five minutes.'
                }
                onClick={toggleGrant}
              >
                {access()?.grant
                  ? 'Revoke agent access'
                  : conversation()
                    ? `Grant #${conversation()} · 5 min`
                    : 'Grant agent access'}
              </Button>
            </Show>
            <Button
              size="sm"
              variant="outline"
              disabled={!opened() && (!ready() || launching())}
              data-agent-confirm={
                opened() ? 'Stops this shell.' : 'Starts a shell with full OS user privileges.'
              }
              onClick={(event) => {
                if (!trustedPerson(event)) return
                if (opened()) stop()
                else launch.request()
              }}
            >
              {opened() ? 'Stop' : 'Start shell'}
            </Button>
          </div>
          <div
            role={error() ? 'alert' : 'status'}
            class={[
              'm-3 rounded-lg border p-3 text-[12px]',
              error() ? 'border-error/30 bg-error/5' : 'border-border/70 text-muted-foreground',
            ]}
          >
            {state()}
            <Show when={opened()}>
              <p class="mt-1 text-muted-foreground">
                <Show when={access()?.grant} fallback="Agent access off">
                  {(grant) =>
                    `Granted #${grant().conversation} until ${new Date(grant().expires).toLocaleTimeString()}`
                  }
                </Show>{' '}
                · {access()?.sessionId} · Output enters the granted conversation. Agent close only
                for agent-owned shells; arbitrary write can still exit any granted shell (not a
                command sandbox).
              </p>
            </Show>
          </div>
          <fieldset
            ref={(element) => {
              container = element
            }}
            class="wterm min-h-0 min-w-0 flex-1 overflow-hidden font-mono"
            style={{
              '--term-bg': 'var(--background)',
              '--term-fg': 'var(--foreground)',
              '--term-cursor': 'var(--foreground)',
              'box-shadow': 'none',
              'border-radius': '0',
            }}
            aria-label="Terminal"
            aria-roledescription="terminal"
          />
        </main>
      </div>
      <style>{terminalCss}</style>
      <StatusLine />
    </>
  )
}
function OpenTerminal() {
  return (
    <Button size="sm" variant="outline" onClick={() => showSurface('terminal')}>
      Открыть терминал
    </Button>
  )
}

type TerminalDetails = {
  state?: string
  requestId?: string
  conversation?: number
  cwd?: string
  sessionId?: string
  secretOutput?: string
  truncated?: boolean
}

function LaunchApproval(props: { requestId: string; details: TerminalDetails | undefined }) {
  const availability = useAction(
    Approval,
    {
      get requestId() {
        return props.requestId
      },
    },
    { every: 1000 },
  )
  const [choice, setChoice] = createSignal('')
  const [canOpen, setCanOpen] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  async function decide(event: MouseEvent, approve: boolean) {
    if (!trustedPerson(event) || busy()) return
    const requestId = props.requestId
    setBusy(true)
    try {
      if (approve) {
        setCanOpen(true)
        const result = await api.action(Approve, { requestId })
        setChoice(`Approved · session ${result.sessionId}`)
        try {
          await api.submit(
            `Terminal launch approved. Session ${result.sessionId}. Call terminal status for your grant generation.`,
            'followUp',
            result.conversation,
          )
        } catch {
          setChoice(
            `Shell started · session ${result.sessionId} · continuation not delivered. Do not approve again.`,
          )
        }
      } else {
        const result = await api.action(Deny, { requestId })
        setChoice('Denied · no shell started')
        try {
          await api.submit(
            'Terminal launch denied. No shell was started.',
            'followUp',
            result.conversation,
          )
        } catch {
          setChoice('Denied · no shell started · continuation not delivered')
        }
      }
    } catch {
      // #47345/review50791: a lost approval response does not undo the spawn.
      setChoice(
        approve
          ? 'Shell may have started; continuation not sent; do not retry approval.'
          : 'Unavailable · deny request expired, handled or reloaded',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card
      attention={!choice() && availability.data()?.available}
      class="space-y-2 p-3 text-[12px]"
      data-terminal-approval={props.requestId}
    >
      <p class="font-medium">Terminal · launch approval for #{props.details?.conversation}</p>
      <p class="font-mono text-[11px] text-muted-foreground">
        {props.details?.cwd} · request {props.requestId}
      </p>
      <p>
        Full OS user privileges. Approve creates one agent-owned shell and permits this conversation
        to read, write and close it for five minutes. Output enters its context. No command sandbox.
        Approve &amp; continue also sends your approval as input to the requesting conversation.
      </p>
      {choice() ? (
        <output class="block">{choice()}</output>
      ) : availability.data()?.available ? (
        <div class="flex gap-2">
          <Button
            size="sm"
            disabled={busy()}
            data-agent-confirm="Starts an agent-owned shell and sends approval to the requesting conversation."
            onClick={(event) => void decide(event, true)}
          >
            Approve &amp; continue
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy()}
            data-agent-confirm="Denies the shell launch and tells the requesting conversation."
            onClick={(event) => void decide(event, false)}
          >
            Deny
          </Button>
        </div>
      ) : (
        <output class="block text-muted-foreground">
          {availability.loading()
            ? 'Checking request…'
            : 'Unavailable · request expired, handled or reloaded'}
        </output>
      )}
      <Show when={canOpen()}>
        <OpenTerminal />
      </Show>
    </Card>
  )
}

function TerminalTool(props: SolidToolProps) {
  const details = () => props.call.details as TerminalDetails | undefined
  const requestId = () => (details()?.state === 'pending' ? details()?.requestId : undefined)
  return (
    <Show
      when={requestId()}
      keyed
      fallback={
        <Tool defaultOpen={!!details()?.secretOutput}>
          <ToolHeader
            name="terminal"
            action={<OpenTerminal />}
            state={props.call.status}
            title={`${typeof props.call.args.action === 'string' ? props.call.args.action : ''} · ${details()?.state ?? 'working'}`}
          />
          <ToolContent>
            <div class="space-y-2 p-3 text-[12px]">
              <Show when={details()?.sessionId}>
                <p class="font-mono text-[11px] text-muted-foreground">{details()?.sessionId}</p>
              </Show>
              <Show when={details()?.truncated}>
                <p class="text-warning">Earlier output truncated</p>
              </Show>
              <Show when={details()?.secretOutput}>
                {(output) => (
                  <pre class="max-h-64 overflow-auto whitespace-pre-wrap">
                    <AnsiOutput output={output()} />
                  </pre>
                )}
              </Show>
            </div>
          </ToolContent>
        </Tool>
      }
    >
      {(id) => <LaunchApproval requestId={id} details={details()} />}
    </Show>
  )
}
export default defineWebExtension({
  slots: { 'titlebar.right': [OpenShellButton] },
  tools: { terminal: attention(TerminalTool) },
  surfaces: [
    {
      id: 'terminal',
      title: 'Terminal',
      icon: TerminalIcon,
      order: 81,
      component: TerminalSurface,
    },
  ],
})
