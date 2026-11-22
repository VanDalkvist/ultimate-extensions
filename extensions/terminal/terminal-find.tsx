import type { WTerm } from '@wterm/dom'
import { CaseSensitiveIcon, ChevronDownIcon, ChevronUpIcon, SearchIcon, XIcon } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

export type TerminalSearchState = {
  count: number
  activeIndex: number
  searching: boolean
  limited: boolean
}

/**
 * Uses wterm's built-in retained-buffer search. Do not install xterm.js addons:
 * this terminal is WTerm + Ghostty, not an xterm.js instance.
 */
export function TerminalFind({ instance }: { instance: WTerm | null }) {
  const [result, setResult] = useState<TerminalSearchState>({
    count: 0,
    activeIndex: -1,
    searching: false,
    limited: false,
  })
  const [visible, setVisible] = useState(false)
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!instance) return
    const previous = instance.onSearchChange
    instance.onSearchChange = (value) => {
      previous?.(value)
      setResult(value)
    }
    setResult(instance.getSearchState())
    return () => { instance.onSearchChange = previous }
  }, [instance])

  useEffect(() => {
    if (!instance) return
    if (visible && query) instance.search(query, { caseSensitive })
    else instance.clearSearch()
  }, [instance, visible, query, caseSensitive])

  useLayoutEffect(() => {
    if (visible) input.current?.focus()
  }, [visible])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Bash uses Ctrl+F for forward-character. Only intercept Command+F
      // on macOS, Ctrl+Shift+F elsewhere.
      const key = event.key.toLowerCase()
      const find = key === 'f' && !event.altKey &&
        ((event.metaKey && !event.ctrlKey) ||
          (event.ctrlKey && event.shiftKey && !event.metaKey))
      if (find && instance) {
        event.preventDefault()
        setVisible(true)
        input.current?.select()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [instance])

  function close() {
    setVisible(false)
    instance?.clearSearch()
    instance?.focus()
  }

  return (
    <div className="relative shrink-0">
      <Button
        aria-expanded={visible}
        aria-label="Find in terminal output"
        disabled={!instance}
        size="sm"
        title="Find in terminal output (⌘F / Ctrl+Shift+F)"
        variant="ghost"
        onClick={() => setVisible((value) => !value)}
      >
        <SearchIcon className="size-3.5" />
        Find
      </Button>
      {visible && (
        <div
          aria-label="Terminal find"
          className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-border bg-background p-2 shadow-lg"
          role="search"
        >
          <div className="flex min-w-0 items-center gap-1">
            <input
              ref={input}
              aria-label="Search terminal history"
              autoComplete="off"
              className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 font-mono text-[12px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
              maxLength={160}
              placeholder="Find in output"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  event.stopPropagation()
                  close()
                } else if (event.key === 'Enter') {
                  event.preventDefault()
                  if (event.shiftKey) instance?.findPrevious()
                  else instance?.findNext()
                }
              }}
            />
            <Button
              aria-label="Match case"
              aria-pressed={caseSensitive}
              size="icon-sm"
              title="Match case"
              variant={caseSensitive ? 'outline' : 'ghost'}
              onClick={() => setCaseSensitive((value) => !value)}
            >
              <CaseSensitiveIcon className="size-3.5" />
            </Button>
            <Button
              aria-label="Previous match"
              disabled={!query}
              size="icon-sm"
              variant="ghost"
              onClick={() => instance?.findPrevious()}
            >
              <ChevronUpIcon className="size-3.5" />
            </Button>
            <Button
              aria-label="Next match"
              disabled={!query}
              size="icon-sm"
              variant="ghost"
              onClick={() => instance?.findNext()}
            >
              <ChevronDownIcon className="size-3.5" />
            </Button>
            <Button aria-label="Close find" size="icon-sm" variant="ghost" onClick={close}>
              <XIcon className="size-3.5" />
            </Button>
          </div>
          <p className="px-1 pt-1.5 font-mono text-[10px] text-muted-foreground" role="status">
            {!query
              ? 'Searches the retained terminal history'
              : result.searching
                ? 'Searching…'
                : result.count === 0
                  ? 'No matches'
                  : result.limited
                    ? String(result.count) + '+ matches'
                    : String(result.count) + ' matches'}
          </p>
        </div>
      )}
    </div>
  )
}
