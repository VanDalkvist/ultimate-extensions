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
    // #47345: concurrent UI readers can reject a stale cursor. Detaching a view
    // must not kill an agent-owned shell that native tools are still using.
    const detached = !explicit && session?.owner === 'agent'
    if (session && !detached) {
      // The server lease retries cleanup if the unload request cannot finish.
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
    failed: (reason = 'request failed') => release(false, reason),
  }
}
