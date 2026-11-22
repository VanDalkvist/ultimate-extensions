import { CheckIcon, ChevronDownIcon, TerminalIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { ShellCatalog } from './shells.ts'

export function TerminalShellPicker({
  catalog,
  value,
  runningShell,
  onChange,
}: {
  catalog?: ShellCatalog
  value: string
  runningShell?: string
  onChange(value: string): void
}) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)
  const current = value === 'system'
    ? catalog?.systemDefault
    : value
  const label = (path?: string) => path?.split('/').at(-1) ?? 'Shell'
  const available = !!catalog?.shells.some(option => option.path === current)
  const effective = runningShell ?? current

  useEffect(() => {
    if (!open) return
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !anchor.current?.contains(event.target)) setOpen(false)
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
        anchor.current?.querySelector('button')?.focus()
      }
    }
    window.addEventListener('pointerdown', closeOutside)
    window.addEventListener('keydown', escape, true)
    return () => {
      window.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('keydown', escape, true)
    }
  }, [open])

  function select(value: string) {
    onChange(value)
    setOpen(false)
    anchor.current?.querySelector('button')?.focus()
  }

  return (
    <div ref={anchor} className="terminal-shell-picker relative shrink-0">
      <Button
        size="sm"
        variant="ghost"
        disabled={!catalog || !catalog.shells.length}
        aria-expanded={open}
        aria-label="Choose default terminal shell"
        title={runningShell
          ? `Running ${label(runningShell)} · changes take effect on the next shell`
          : 'Choose the shell for future sessions; no system settings are changed'}
        onClick={() => setOpen(current => !current)}
      >
        <TerminalIcon className="size-3.5 text-muted-foreground" />
        <span className="font-mono">{label(effective)}</span>
        <ChevronDownIcon className="size-3.5 text-muted-foreground" />
      </Button>
      {open && catalog && (
        <div className="terminal-shell-menu" role="group" aria-label="Default shell">
          <div className="terminal-shell-menu-title">New sessions open with</div>
          <button
            type="button"
            className="terminal-shell-option"
            aria-pressed={value === 'system'}
            onClick={() => select('system')}
          >
            <span>
              <strong>System default</strong>
              <small>{label(catalog.systemDefault)} · {catalog.systemDefault}</small>
            </span>
            {value === 'system' && <CheckIcon className="size-4" />}
          </button>
          {catalog.shells.map(option => (
            <button
              type="button"
              className="terminal-shell-option"
              key={option.path}
              aria-pressed={value === option.path}
              onClick={() => select(option.path)}
            >
              <span>
                <strong>{option.name}</strong>
                <small>{option.path}</small>
              </span>
              {value === option.path && <CheckIcon className="size-4" />}
            </button>
          ))}
          {!available && <p className="terminal-shell-menu-hint">Chosen shell is unavailable. Pick another.</p>}
          <p className="terminal-shell-menu-hint">
            Saved in this browser · applies to the next shell · never changes your OS login shell
          </p>
        </div>
      )}
    </div>
  )
}
