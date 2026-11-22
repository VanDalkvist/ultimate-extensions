import { retriedLater } from '../../../lib/errors.ts'

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
  let disposed = false
  let hidden = false
  let terminal: Term | undefined
  let epoch = 0
  let requested = false
  let phase: 'idle' | 'inspect' | 'open' = 'idle'
  let inspectedEpoch: number | undefined

  async function prepare() {
    if (disposed || hidden || !terminal || phase !== 'idle' || options.running()) return
    const ready = terminal
    const version = epoch
    const current = () => !disposed && !hidden && epoch === version
    phase = 'inspect'
    inspectedEpoch = version
    options.busy(true)
    options.changed('Checking for an active shell…')
    try {
      const existing = await options.inspect()
      if (!current()) return
      const start = requested
      requested = false
      if (existing?.owner === 'agent') {
        options.attach(existing, ready, true)
      } else if (!start) {
        options.changed('Ready · start a shell explicitly')
      } else if (existing) {
        options.changed('A shell is already active in another view', true)
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
      if (!disposed) options.busy(false)
    }
  }

  return {
    disconnect() {
      disposed = true
      terminal = undefined
    },
    ready(value: Term) {
      if (disposed) return
      terminal = value
      void prepare()
    },
    request(this: void) {
      if (disposed || hidden || options.running() || phase === 'open') return
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
