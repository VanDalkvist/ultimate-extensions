import { settled } from './errors.ts'
import type { ConversationId } from '@earendil-works/pi-durable'
import terminalCss from '@wterm/dom/css?inline'
import { GhosttyCore } from '@wterm/ghostty'
import wasmUrl from '@wterm/ghostty/ghostty-vt.wasm?url'
import { Terminal } from '@wterm/react'
import type { TerminalHandle } from '@wterm/react'
import type { WTerm } from '@wterm/dom'
import { TerminalIcon } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  actionRef,
  ActionError,
  api,
  attention,
  Card,
  defineWebExtension,
  Header,
  Sidebar,
  StatusLine,
  useAction,
  useConversation,
  useUltimate,
} from '@/sdk'
import type { ToolCallView } from '@/sdk'
import { Tool, ToolHeader, ToolContent, ToolOutput } from '@/components/ai/tool'
import { terminalViewLifecycle } from './lifecycle.tsx'
import { readWithRetry } from './read-retry.tsx'
import { shellLaunch, shellOpenIntent } from './shell-launch.tsx'
import { TerminalFind } from './terminal-find.tsx'
import { TerminalAgentSelection } from './terminal-agent-selection.tsx'
import './web.css'

type Grant = { conversation: ConversationId; expires: number; generation: string }
type Metadata = { sessionId: string; owner: 'user' | 'agent'; grant: Grant | null }
type Opened = Metadata & {
  secretToken: string
  secretReplay?: string
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

const openIntent = shellOpenIntent()

function OpenShellButton() {
  const { showSurface } = useUltimate()
  const [routeRequest, setRouteRequest] = useState(0)
  useLayoutEffect(() => {
    if (routeRequest) openIntent.routeCommitted()
  }, [routeRequest])
  useLayoutEffect(() => {
    window.addEventListener('pagehide', openIntent.clear)
    return () => {
      openIntent.clear()
      window.removeEventListener('pagehide', openIntent.clear)
    }
  }, [])
  return (
    <Button
      className="h-6 shrink-0 gap-1.5 px-2 font-mono text-[11px]"
      size="sm"
      variant="outline"
      title="Open a shell with full OS user privileges"
      onClick={(event) => {
        if (!event.nativeEvent.isTrusted) return
        openIntent.request(() => {
          showSurface('terminal')
          setRouteRequest((count) => count + 1)
        })
      }}
    >
      <TerminalIcon className="size-3.5 max-md:hidden" />
      Open shell
    </Button>
  )
}

function TerminalSurface() {
  const conversation = useConversation((value) => value.id)
  const [access, setAccess] = useState<Metadata>()
  const [core, setCore] = useState<GhosttyCore>()
  const [state, setState] = useState('Loading terminal…')
  const [error, setError] = useState(false)
  const [opened, setOpened] = useState<Opened>()
  const term = useRef<TerminalHandle>(null)
  const running = useRef<Running | null>(null)
  const mounted = useRef(false)
  const [ready, setReady] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [changingGrant, setChangingGrant] = useState(false)
  const grantInFlight = useRef(false)
  const [terminalInstance, setTerminalInstance] = useState<WTerm | null>(null)

  const [{ stop, leave, pagehide, failed }] = useState(() =>
    terminalViewLifecycle({
      take() {
        const s = running.current
        running.current = null
        return s
      },
      close: closeShell,
      changed(nextState, nextError) {
        if (mounted.current) {
          setOpened(undefined)
          setState(nextState)
          setError(nextError)
        }
      },
    }),
  )

  function control(args: Control) {
    const s = running.current
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
        if (running.current !== s) throw new Error('Terminal stopped')
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
      if (running.current === s) failed()
    })
    return next
  }
  function input(bytes: Uint8Array) {
    if (!running.current) return
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
    running.current = s
    try {
      if (existing) await control({ cols: terminal.cols, rows: terminal.rows })
      if (running.current !== s) return
      setOpened(value)
      setAccess(value)
      setState('Running')
      if (existing && value.secretReplay) {
        // Inspect replays only acknowledged bytes; Read starts at the live
        // base cursor, so the same bytes are not rendered twice.
        terminal.write(
          Uint8Array.from(atob(value.secretReplay), (char) => char.charCodeAt(0)),
        )
      }
      terminal.focus()
      let cursor = value.cursor
      while (running.current === s) {
        const result = await readWithRetry(
          () =>
            api.action(
              Read,
              { secretToken: s.secretToken, cursor, ack: cursor > value.cursor ? true : undefined },
              { signal: s.abort.signal },
            ),
          s.abort.signal,
        )
        if (running.current !== s) break
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
      if (running.current === s) {
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

  const [launch] = useState(() =>
    shellLaunch<WTerm, Opened>({
      inspect: () => api.action(Inspect, {}),
      open: (size) => api.action(Open, size),
      close: closeShell,
      running: () => running.current !== null,
      busy: setLaunching,
      changed(next, failure = false) {
        setState(next)
        setError(failure)
      },
      attach: (value, terminal, existing) => void run(value, terminal, existing),
    }),
  )

  useLayoutEffect(() => {
    mounted.current = true
    launch.connect()
    const disconnectIntent = openIntent.connect(launch.request)
    function hide() {
      launch.hide()
      pagehide()
    }
    window.addEventListener('pagehide', hide)
    window.addEventListener('pageshow', launch.show)
    return () => {
      mounted.current = false
      disconnectIntent()
      launch.disconnect()
      leave()
      window.removeEventListener('pagehide', hide)
      window.removeEventListener('pageshow', launch.show)
    }
  }, [launch, leave, pagehide])

  useEffect(() => {
    let active = true
    let loaded: GhosttyCore | undefined
    void GhosttyCore.load({ wasmPath: wasmUrl, scrollbackLines: 1000, imageStorageLimit: 0 })
      .then((value) => {
        if (!active) {
          value.dispose()
          return
        }
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
      loaded?.dispose()
    }
  }, [launch])

  return (
    <>
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main
          className="flex min-w-0 flex-1 flex-col"
          data-terminal-state={opened ? 'running' : state}
          data-terminal-pid={opened?.pid}
        >
          <Header>
            <span className="flex items-center gap-2 text-[13px] font-medium">
              <TerminalIcon className="size-4 text-muted-foreground" />
              Terminal
            </span>
          </Header>
          <div className="terminal-toolbar flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/70 px-3 py-2">
            <div className="terminal-summary min-w-0 flex-1 text-[11px] text-muted-foreground">
              <p className="truncate font-mono">
                {opened?.cwd ?? 'Fixed project directory · /bin/bash --noprofile --norc -i'}
              </p>
              <p>
                Full OS access · Bash · 10-minute maximum · Stop ends the shell
              </p>
            </div>
            <TerminalFind instance={terminalInstance} />
            <TerminalAgentSelection instance={terminalInstance} conversation={conversation} />
            {opened && (
              <Button
                size="sm"
                variant="outline"
                disabled={changingGrant || (!access?.grant && conversation === undefined)}
                title="Grant or revoke full read/write control of this OS-privileged shell; sharing a selection does not grant access"
                onClick={async () => {
                  if (grantInFlight.current) return
                  grantInFlight.current = true
                  setChangingGrant(true)
                  try {
                    const updated = access?.grant
                      ? await api.action(Revoke, { secretToken: opened.secretToken })
                      : await api.action(GrantAction, {
                          secretToken: opened.secretToken,
                          conversation: conversation!,
                        })
                    setAccess(updated)
                    setError(false)
                    setState('Running')
                  } catch {
                    // A failed grant/revoke response is not a terminal fault.
                    // The command may have succeeded despite network failure:
                    // reconcile the effective server-side permission via Inspect.
                    try {
                      const current = await api.action(Inspect, {})
                      if (current?.sessionId === opened.sessionId) setAccess(current)
                    } catch {
                      // Leave the shell alive and report uncertain access.
                    }
                    setState('Shell access change not confirmed · check status before retrying')
                    setError(true)
                  } finally {
                    grantInFlight.current = false
                    setChangingGrant(false)
                  }
                }}
              >
                {changingGrant
                  ? 'Updating access…'
                  : access?.grant
                    ? 'Revoke shell control'
                    : 'Allow shell control · 5 min'}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={!opened && (!ready || launching)}
              onClick={(event) => {
                if (opened) stop()
                else if (event.nativeEvent.isTrusted) launch.request()
              }}
            >
              {opened ? 'Stop' : 'Start shell'}
            </Button>
          </div>
          {!opened ? (
            <div
              role={error ? 'alert' : 'status'}
              className={`mx-3 my-2 rounded-md px-3 py-2 text-[12px] ${error ? 'border border-error/30 bg-error/5 text-error' : 'text-muted-foreground'}`}
            >
              {state}
            </div>
          ) : (
            <div
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/50 px-3 py-1.5 font-mono text-[10px] text-muted-foreground"
              role={error ? 'alert' : 'status'}
            >
              <span className={error ? 'text-error' : 'text-foreground'}>{state}</span>
              <span>PID {opened.pid}</span>
              <span title={access?.grant
                ? 'Agent can read and write the shell until ' + new Date(access.grant.expires).toLocaleTimeString()
                : 'Agent has no access to this shell'}>
                {access?.grant ? 'Agent granted · 5 min max' : 'Agent off'}
              </span>
              <span className="ml-auto">
                {opened.owner === 'agent'
                  ? 'Agent-owned · 30-second renewable lease'
                  : 'Manual shell · closes on reload or after 10 min'}
              </span>
            </div>
          )}
          {core && (
            <Terminal
              className="min-h-0 flex-1 overflow-hidden font-mono"
              style={
                {
                  '--term-bg': 'var(--background)',
                  '--term-fg': 'var(--foreground)',
                  '--term-cursor': 'var(--foreground)',
                  boxShadow: 'none',
                  borderRadius: 0,
                } as React.CSSProperties
              }
              core={core}
              autoResize
              renderer="dom"
              webmcp={false}
              debug={false}
              ref={term}
              onReady={(value: WTerm) => {
                if (term.current?.instance !== value) return
                setReady(true)
                setTerminalInstance(value)
                launch.ready(value)
              }}
              onResize={(cols: number, rows: number) => {
                if (running.current) void settled(control({ cols, rows }))
              }}
              onData={(secretInput: string) => input(new TextEncoder().encode(secretInput))}
              onBinary={input}
              onError={() => {
                setTerminalInstance(null)
                launch.invalidate()
                setReady(false)
                failed()
              }}
            />
          )}
        </main>
      </div>
      <style>{terminalCss}</style>
      <StatusLine />
    </>
  )
}
function TerminalTool({ call }: { call: ToolCallView }) {
  const { showSurface } = useUltimate()
  const openTerminal = (
    <Button size="sm" variant="outline" onClick={() => showSurface('terminal')}>
      Открыть терминал
    </Button>
  )
  const details = call.details as
    | {
        state?: string
        requestId?: string
        conversation?: number
        cwd?: string
        sessionId?: string
        secretOutput?: string
        truncated?: boolean
      }
    | undefined
  const requestId = details?.state === 'pending' ? details.requestId : undefined
  const availability = useAction(
    Approval,
    { requestId: requestId ?? '' },
    { enabled: !!requestId, every: 1000 },
  )
  const [choice, setChoice] = useState('')
  const [canOpen, setCanOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  async function decide(approve: boolean) {
    if (!requestId || busy) return
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
  if (requestId)
    return (
      <Card
        attention={!choice && availability.data?.available}
        className="space-y-2 p-3 text-[12px]"
        data-terminal-approval={requestId}
      >
        <p className="font-medium">Terminal · launch approval for #{details?.conversation}</p>
        <p className="font-mono text-[11px] text-muted-foreground">
          {details?.cwd} · request {requestId}
        </p>
        <p>
          Full OS user privileges. Approve creates one agent-owned shell and permits this
          conversation to read, write and close it for five minutes. Output enters its context. No
          command sandbox. Approve &amp; continue also sends your approval as input to the
          requesting conversation.
        </p>
        {choice ? (
          <p role="status">{choice}</p>
        ) : availability.data?.available ? (
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => void decide(true)}>
              Approve &amp; continue
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void decide(false)}>
              Deny
            </Button>
          </div>
        ) : (
          <p role="status" className="text-muted-foreground">
            {availability.loading
              ? 'Checking request…'
              : 'Unavailable · request expired, handled or reloaded'}
          </p>
        )}
        {canOpen && openTerminal}
      </Card>
    )
  return (
    <Tool defaultOpen={!!details?.secretOutput}>
      <ToolHeader
        name="terminal"
        action={openTerminal}
        state={call.status}
        title={`${typeof call.args.action === 'string' ? call.args.action : ''} · ${details?.state ?? 'working'}`}
      />
      <ToolContent>
        <div className="space-y-2 p-3 text-[12px]">
          {details?.sessionId && (
            <p className="font-mono text-[11px] text-muted-foreground">{details.sessionId}</p>
          )}
          {details?.truncated && <p className="text-warning">Earlier output truncated</p>}
        </div>
        {details?.secretOutput && <ToolOutput output={details.secretOutput} />}
      </ToolContent>
    </Tool>
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
