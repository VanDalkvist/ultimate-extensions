import { retriedLater } from './errors.ts'

export function shellOpenIntent() {
  let pending = false
  let receive: (() => void) | undefined
  return {
    request(navigate: () => void) {
      if (receive) {
        receive()
        navigate()
        return
      }
      pending = true
      navigate()
    },
    routeCommitted() {
      if (pending)
        queueMicrotask(() => {
          pending = false
        })
    },
    connect(listener: () => void) {
      receive = listener
      if (pending) {
        pending = false
        listener()
      }
      return () => {
        receive = undefined
      }
    },
    clear(this: void) {
      pending = false
    },
  }
}

type Shell = { owner: 'agent' | 'user'; secretToken: string }
type Dimensions = { cols: number; rows: number }

export function shellLaunch<Term extends Dimensions, Session extends Shell>(options: {
  inspect(): Promise<Session | null>
  open(size: Dimensions): Promise<Session>
  attach(value: Session, terminal: Term, existing: boolean): void
  close(secretToken: string): Promise<unknown>
  running(): boolean
  busy(busy: boolean): void
  changed(state: string, error?: boolean): void
}) {
  let connected = false
  let hidden = false
  let terminal: Term | undefined
  let epoch = 0
  let requested = false
  let phase: 'idle' | 'inspect' | 'open' = 'idle'
  let inspectedEpoch: number | undefined

  async function prepare() {
    if (!connected || hidden || !terminal || phase !== 'idle' || options.running()) return
    const ready = terminal
    const version = epoch
    const current = () => connected && !hidden && epoch === version && terminal === ready
    phase = 'inspect'
    inspectedEpoch = version
    options.busy(true)
    options.changed('Checking for an active shell…')
    try {
      const existing = await options.inspect()
      if (!current()) return
      const start = requested
      requested = false
      if (existing) {
        // The server owns the PTY; navigation only replaces the viewport.
        options.attach(existing, ready, true)
      } else if (!start) {
        options.changed('Ready · start a shell explicitly')
      } else {
        phase = 'open'
        options.changed('Starting shell…')
        // Do not abort or retry: a late capability is required to close an orphan.
        const opened = await options.open({ cols: ready.cols, rows: ready.rows })
        if (current()) options.attach(opened, ready, false)
        else void options.close(opened.secretToken).catch(retriedLater)
      }
    } catch {
      if (current()) {
        requested = false
        options.changed(
          phase === 'inspect' ? 'Could not check for an active shell' : 'Shell could not start',
          true,
        )
      }
    } finally {
      phase = 'idle'
      if (connected) options.busy(false)
    }
  }

  return {
    connect() {
      connected = true
    },
    disconnect() {
      connected = false
      if (terminal) requested = false
      terminal = undefined
      epoch++
      // An intent still waiting for readiness survives StrictMode's mount replay on this instance.
    },
    ready(value: Term) {
      if (!connected || terminal === value) return
      if (terminal) {
        requested = false
        epoch++
      }
      terminal = value
      void prepare()
    },
    request(this: void) {
      if (!connected || hidden || options.running() || phase === 'open') return
      if (phase === 'inspect' && inspectedEpoch !== epoch) return
      requested = true
      void prepare()
    },
    invalidate() {
      terminal = undefined
      requested = false
      epoch++
    },
    hide() {
      hidden = true
      requested = false
      epoch++
    },
    show(this: void) {
      hidden = false
    },
  }
}
