import { retriedLater } from './errors.ts'

type ViewSession = {
  owner: 'user' | 'agent'
  secretToken: string
  abort: AbortController
}

export function terminalViewLifecycle(options: {
  take(): ViewSession | null
  close(secretToken: string): Promise<unknown>
  changed(state: string, error: boolean): void
}) {
  function release(explicit: boolean, failure?: string, pagehide = false) {
    const session = options.take()
    session?.abort.abort()
    // Switching Ultimate surfaces unmounts the view, not its PTY.
    // Page unload, explicit Stop or a failed manual transport still close
    // user shells. Agent-owned shells retain their existing detach policy.
    const detached =
      !!session &&
      !explicit &&
      (session.owner === 'agent' || (!pagehide && failure === undefined))
    if (session && !detached) {
      // The server deadline retries cleanup if this request cannot finish.
      void options.close(session.secretToken).catch(retriedLater)
    }
    options.changed(
      detached
        ? `View detached${failure ? `: ${failure}` : ''} · session may still be active`
        : failure
          ? `Terminal stopped: ${failure}`
          : 'Stopped',
      detached || failure !== undefined,
    )
  }
  return {
    stop: () => release(true),
    leave: () => release(false),
    pagehide: () => release(false, undefined, true),
    failed: (reason = 'request failed') => release(false, reason),
  }
}
