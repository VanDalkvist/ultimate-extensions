import type { WTerm } from '@wterm/dom'
import { WTerm as Terminal } from '@wterm/dom'
import type { GhosttyCore } from '@wterm/ghostty'
import { onSettled } from 'solid-js'

/**
 * Solid's lifecycle owns exactly one WTerm DOM instance.
 * Do not mount @wterm/react in a Solid facet or expose terminal WebMCP.
 * The server PTY survives view switches; only this DOM emulator is destroyed.
 */
export function TerminalEmulator(props: {
  core: GhosttyCore
  onReady(terminal: WTerm): void
  onData(data: string): void
  onBinary(data: Uint8Array): void
  onResize(cols: number, rows: number): void
  onError(error: unknown): void
}) {
  let element: HTMLDivElement | undefined
  onSettled(() => {
    if (!element) return
    let alive = true
    const instance = new Terminal(element, {
      cols: 80,
      rows: 24,
      core: props.core,
      autoResize: true,
      renderer: 'dom',
      webmcp: false,
      debug: false,
      onData: (value) => props.onData(value),
      onBinary: (value) => props.onBinary(value),
      onResize: (cols, rows) => props.onResize(cols, rows),
    })
    void instance.init().then(() => {
      if (alive) props.onReady(instance)
    }).catch((error: unknown) => {
      if (alive) props.onError(error)
    })
    return () => {
      alive = false
      instance.destroy()
    }
  })
  return (
    <div
      ref={element}
      class="min-h-0 flex-1 overflow-hidden font-mono"
      role="group"
      aria-label="Terminal"
      aria-roledescription="terminal"
      style={{
        '--term-bg': 'var(--background)',
        '--term-fg': 'var(--foreground)',
        '--term-cursor': 'var(--foreground)',
        'box-shadow': 'none',
        'border-radius': '0',
      }}
    />
  )
}
