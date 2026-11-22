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
  function release(explicit: boolean, failure?: string) {
    const session = options.take()
    session?.abort.abort()
    // Switching surfaces, browser refresh and page navigation detach the
    // reader but never kill a still-bounded PTY. Explicit Stop and a fatal
    // manual transport failure retain their original close semantics.
    // The server's expiry timer and host.onClose own ultimate process cleanup.
    const detached =
      !!session &&
      !explicit &&
      (session.owner === 'agent' || failure === undefined)
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
    pagehide: () => release(false),
    failed: (reason = 'request failed') => release(false, reason),
  }
}
