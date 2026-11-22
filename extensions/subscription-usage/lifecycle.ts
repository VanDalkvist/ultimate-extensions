/** Ultimate's open phase is disposable. Release is no longer a host method. */
export interface OpenScope {
  defer(cleanup: () => void | Promise<void>): void
}

export interface UsageLifetime {
  open(): void
  close(): Promise<void>
}

export function registerUsageLifetime(
  host: { onOpen(callback: (scope: OpenScope) => void | Promise<void>): void },
  lifetime: UsageLifetime,
) {
  host.onOpen((scope) => {
    // Register cleanup before changing state so a partially completed open
    // still gets its pending requests cancelled on a core swap.
    scope.defer(() => lifetime.close())
    lifetime.open()
  })
}
