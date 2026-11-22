import type { ConversationId } from '@earendil-works/pi-durable'
import type { WTerm } from '@wterm/dom'
import {
  CaseSensitive, Check, ChevronDown, ChevronUp, Search, Send, Terminal, X,
} from '@lucide/solid'
import { For, Show, createEffect, createSignal, onSettled } from 'solid-js'
import { Button } from '@/components/ui/button.solid.tsx'
import {
  Dialog, DialogContent, DialogDescription, DialogTitle,
} from '@/components/ui/dialog.solid.tsx'
import { api } from '@/sdk/solid'
import type { ShellCatalog } from './shells.ts'
import {
  maxAgentSelectionBytes, terminalAgentSubmission, terminalSelectionBytes,
} from './terminal-agent-context.ts'
import { isTerminalFindShortcut } from './terminal-keybindings.ts'

type TerminalSearchState = { count: number; activeIndex: number; searching: boolean; limited: boolean }

export function TerminalFind(props: { instance: () => WTerm | null }) {
  const [visible, setVisible] = createSignal(false)
  const [query, setQuery] = createSignal('')
  const [caseSensitive, setCaseSensitive] = createSignal(false)
  const [result, setResult] = createSignal<TerminalSearchState>({
    count: 0, activeIndex: -1, searching: false, limited: false,
  })
  const [top, setTop] = createSignal(96)
  let field: HTMLInputElement | undefined
  let anchor: HTMLDivElement | undefined

  createEffect(
    () => props.instance(),
    (terminal) => {
      if (!terminal) return
      const previous = terminal.onSearchChange
      terminal.onSearchChange = (value) => {
        previous?.(value)
        setResult(value)
      }
      setResult(terminal.getSearchState())
      return () => { terminal.onSearchChange = previous }
    },
  )
  createEffect(
    () => ({ terminal: props.instance(), visible: visible(), query: query(), case: caseSensitive() }),
    ({ terminal, visible: open, query: value, case: matchCase }) => {
      if (!terminal) return
      if (open && value) terminal.search(value, { caseSensitive: matchCase })
      else terminal.clearSearch()
    },
  )
  createEffect(() => visible(), (open) => {
    if (!open) return
    field?.focus()
    field?.select()
    const bottom = anchor?.getBoundingClientRect().bottom
    if (bottom !== undefined) setTop(Math.max(8, bottom + 6))
  })
  function close() {
    setVisible(false)
    props.instance()?.clearSearch()
    props.instance()?.focus()
  }
  onSettled(() => {
    const keydown = (event: KeyboardEvent) => {
      const source = event.composedPath()[0]
      if (source instanceof Element &&
        (source.closest('[role="dialog"]') ||
          (source !== field && source.closest('input,textarea,select,[contenteditable],[role="textbox"]'))))
        return
      if (props.instance() && isTerminalFindShortcut(event, navigator.platform || navigator.userAgent)) {
        event.preventDefault()
        event.stopPropagation()
        setVisible(true)
        field?.select()
      }
    }
    const measure = () => {
      const bottom = anchor?.getBoundingClientRect().bottom
      if (bottom !== undefined) setTop(Math.max(8, bottom + 6))
    }
    window.addEventListener('keydown', keydown, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('keydown', keydown, true)
      window.removeEventListener('resize', measure)
    }
  })

  return (
    <div ref={anchor} class="relative shrink-0">
      <Button
        size="sm" variant="ghost" aria-label="Find in terminal output"
        aria-expanded={visible()} disabled={!props.instance()}
        title="Search retained terminal output (⌘F / Ctrl+Shift+F)"
        onClick={() => visible() ? close() : setVisible(true)}
      ><Search class="size-3.5" />Find</Button>
      <Show when={visible()}>
        <div
          class="terminal-find-panel"
          role="search" aria-label="Terminal find"
          style={{ '--terminal-find-top': top() + 'px' }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              close()
            }
          }}
        >
          <div>
            <input
              ref={field} class="terminal-find-input" type="search" autocomplete="off"
              aria-label="Search terminal history" maxlength={160}
              placeholder="Find in output" value={query()}
              onInput={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                if (event.shiftKey) props.instance()?.findPrevious()
                else props.instance()?.findNext()
              }}
            />
            <Button size="sm" variant={caseSensitive() ? 'outline' : 'ghost'}
              aria-label="Match case" aria-pressed={caseSensitive()}
              onClick={() => setCaseSensitive(!caseSensitive())}><CaseSensitive class="size-3.5" /></Button>
            <Button size="sm" variant="ghost" disabled={!query()} aria-label="Previous match"
              onClick={() => props.instance()?.findPrevious()}><ChevronUp class="size-3.5" /></Button>
            <Button size="sm" variant="ghost" disabled={!query()} aria-label="Next match"
              onClick={() => props.instance()?.findNext()}><ChevronDown class="size-3.5" /></Button>
            <Button size="sm" variant="ghost" aria-label="Close find" onClick={close}>
              <X class="size-3.5" />
            </Button>
          </div>
          <p class="px-1 pt-1.5 font-mono text-[10px] text-muted-foreground" role="status">
            {!query() ? 'Search retained history'
              : result().searching ? 'Searching…'
                : result().count === 0 ? 'No matches'
                  : result().limited ? result().count + '+ matches' : result().count + ' matches'}
          </p>
        </div>
      </Show>
    </div>
  )
}

type Preview = { text: string; conversation: ConversationId }

export function TerminalAgentSelection(props: {
  instance: () => WTerm | null
  conversation: () => ConversationId | undefined
}) {
  let capture: string | null = null
  let inFlight = false
  const [preview, setPreview] = createSignal<Preview | null>(null)
  const [notice, setNotice] = createSignal('')
  const [sending, setSending] = createSignal(false)
  const [uncertain, setUncertain] = createSignal(false)
  const changed = () => !!preview() && preview()!.conversation !== props.conversation()

  const inspect = () => {
    const value = capture ?? props.instance()?.getSelectionText()
    capture = null
    const recipient = props.conversation()
    if (recipient === undefined) { setNotice('Choose a conversation first'); return }
    if (!value?.trim()) { setNotice('Select output first'); return }
    if (terminalSelectionBytes(value) > maxAgentSelectionBytes) {
      setNotice('Select up to 12 KiB')
      return
    }
    setNotice('')
    setUncertain(false)
    setPreview({ text: value, conversation: recipient })
  }
  const dismiss = () => {
    if (inFlight) return
    setPreview(null)
    setNotice('')
    setUncertain(false)
  }
  const send = async () => {
    const value = preview()
    if (!value || inFlight || uncertain()) return
    let message: string
    try {
      message = terminalAgentSubmission(value, props.conversation()).message
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Invalid terminal selection')
      return
    }
    inFlight = true
    setSending(true)
    setNotice('')
    try {
      await api.submit(message, 'followUp', value.conversation)
      setPreview(null)
      setNotice('Queued for agent')
    } catch {
      setUncertain(true)
      setNotice('Delivery unconfirmed. Check the conversation before trying again.')
    } finally {
      inFlight = false
      setSending(false)
    }
  }
  return (
    <>
      <div class="relative shrink-0">
        <Button size="sm" variant="ghost" disabled={!props.instance() || props.conversation() === undefined}
          aria-label="Share selected terminal output with agent"
          title="Review selected text before sharing. Does not grant shell access."
          onPointerDown={() => { capture = props.instance()?.getSelectionText() ?? null }}
          onClick={inspect}
        ><Send class="size-3.5" />To agent</Button>
        <Show when={notice() && !preview()}>
          <span role="status" class="absolute right-0 top-full z-20 mt-1 whitespace-nowrap rounded bg-popover p-2 text-[11px] text-muted-foreground">
            {notice()}
          </span>
        </Show>
      </div>
      <Dialog open={!!preview()} onOpenChange={(open) => { if (!open) dismiss() }}>
        <DialogContent>
          <DialogTitle>Share selected terminal output?</DialogTitle>
          <DialogDescription>
            Review or remove secrets before sending. This sends text as untrusted context,
            not a command, and grants no shell access.
          </DialogDescription>
          <p class="font-mono text-[11px] text-muted-foreground">
            Destination · Conversation #{preview()?.conversation}
          </p>
          <Show when={changed()}>
            <p class="text-[12px] text-error" role="alert">
              The active conversation changed. Close and select again.
            </p>
          </Show>
          <textarea
            class="terminal-agent-preview" aria-label="Terminal output to share" spellcheck={false}
            value={preview()?.text ?? ''}
            onInput={(event) => {
              const previous = preview()
              if (previous) setPreview({ ...previous, text: event.currentTarget.value })
            }}
          />
          <div class="flex items-center justify-between gap-3">
            <span class="font-mono text-[11px] text-muted-foreground">
              {terminalSelectionBytes(preview()?.text ?? '')} / {maxAgentSelectionBytes} bytes
            </span>
            <div class="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={sending()} onClick={dismiss}>Cancel</Button>
              <Button size="sm" disabled={sending() || uncertain() || changed() ||
                !preview()?.text.trim() || terminalSelectionBytes(preview()?.text ?? '') > maxAgentSelectionBytes}
                onClick={() => void send()}
              >{sending() ? 'Sending…' : uncertain() ? 'Check conversation' : 'Send to agent'}</Button>
            </div>
          </div>
          <Show when={notice()}><p role="alert" class="text-[12px] text-error">{notice()}</p></Show>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function TerminalShellPicker(props: {
  catalog: () => ShellCatalog | undefined
  value: () => string
  runningShell: () => string | undefined
  onChange(value: string): void
}) {
  const [open, setOpen] = createSignal(false)
  let anchor: HTMLDivElement | undefined
  const current = () => props.value() === 'system' ? props.catalog()?.systemDefault : props.value()
  const label = (path?: string) => path?.split('/').at(-1) ?? 'Shell'
  const available = () => props.catalog()?.shells.some((shell) => shell.path === current()) ?? false
  const effective = () => props.runningShell() ?? current()

  onSettled(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !anchor?.contains(event.target)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !open()) return
      event.preventDefault()
      setOpen(false)
      anchor?.querySelector('button')?.focus()
    }
    window.addEventListener('pointerdown', outside)
    window.addEventListener('keydown', escape, true)
    return () => {
      window.removeEventListener('pointerdown', outside)
      window.removeEventListener('keydown', escape, true)
    }
  })
  function select(value: string) {
    props.onChange(value)
    setOpen(false)
    anchor?.querySelector('button')?.focus()
  }
  return (
    <div ref={anchor} class="terminal-shell-picker">
      <Button size="sm" variant="ghost" disabled={!props.catalog()?.shells.length}
        aria-expanded={open()} aria-label="Choose default terminal shell"
        title={props.runningShell()
          ? 'Running ' + label(props.runningShell()) + ' · changes apply to next shell'
          : 'Choose a shell for new sessions; never changes OS settings'}
        onClick={() => setOpen(!open())}
      ><Terminal class="size-3.5" /><span class="font-mono">{label(effective())}</span>
        <ChevronDown class="size-3.5 text-muted-foreground" /></Button>
      <Show when={open() && props.catalog()}>
        <div class="terminal-shell-menu" role="group" aria-label="Choose default shell">
          <div class="terminal-shell-menu-title">New sessions open with</div>
          <button type="button" class="terminal-shell-option" aria-pressed={props.value() === 'system'}
            onClick={() => select('system')}>
            <span><strong>System default</strong>
              <small>{label(props.catalog()?.systemDefault)} · {props.catalog()?.systemDefault}</small></span>
            <Show when={props.value() === 'system'}><Check class="size-4" /></Show>
          </button>
          <For each={props.catalog()?.shells ?? []} keyed={(item) => item.path}>
            {(item) => (
              <button type="button" class="terminal-shell-option"
                aria-pressed={props.value() === item().path}
                onClick={() => select(item().path)}>
                <span><strong>{item().name}</strong><small>{item().path}</small></span>
                <Show when={props.value() === item().path}><Check class="size-4" /></Show>
              </button>
            )}
          </For>
          <Show when={!available()}>
            <p class="terminal-shell-menu-hint">Saved shell unavailable · choose another.</p>
          </Show>
          <p class="terminal-shell-menu-hint">
            Saved in Ultimate · applies to the next shell · OS login shell unchanged
          </p>
        </div>
      </Show>
    </div>
  )
}
