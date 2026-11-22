import type { ConversationId } from '@earendil-works/pi-durable'
import type { WTerm } from '@wterm/dom'
import { SendIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { api } from '@/sdk'
import {
  maxAgentSelectionBytes,
  terminalAgentContext,
  terminalSelectionBytes,
} from './terminal-agent-context.ts'

export function TerminalAgentSelection({
  instance,
  conversation,
}: {
  instance: WTerm | null
  conversation?: ConversationId
}) {
  const cachedSelection = useRef<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [sending, setSending] = useState(false)

  function capture() {
    // WTerm clears selection on focus leave. Capture before the button steals
    // pointer focus; never keep a transcript or send it without a second click.
    cachedSelection.current = instance?.getSelectionText() ?? null
  }

  function inspectSelection() {
    const selected = cachedSelection.current ?? instance?.getSelectionText()
    cachedSelection.current = null
    if (!selected?.trim()) {
      setNotice('Select output first')
      return
    }
    if (terminalSelectionBytes(selected) > maxAgentSelectionBytes) {
      setNotice('Select up to 12 KiB')
      return
    }
    setNotice('')
    setPreview(selected)
  }

  async function send() {
    if (!preview || !conversation || sending) return
    let message: string
    try {
      message = terminalAgentContext(preview)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Invalid selection')
      return
    }
    setSending(true)
    try {
      // A user-confirmed follow-up to the active Ultimate conversation.
      // This only queues the message; it does not run the selected output.
      await api.submit(message, 'followUp', conversation)
      setPreview(null)
      setNotice('Queued for agent')
    } catch {
      setNotice('Could not send · preview kept')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div className="relative shrink-0">
        <Button
          aria-label="Send selected terminal output to agent"
          disabled={!instance || !conversation}
          size="sm"
          title="Review the selected output before sharing it with the active agent"
          variant="ghost"
          onPointerDown={capture}
          onClick={inspectSelection}
        >
          <SendIcon className="size-3.5" />
          To agent
        </Button>
        {notice && (
          <span
            aria-live="polite"
            className="absolute right-0 top-full z-20 mt-1 whitespace-nowrap rounded bg-background px-2 py-1 text-[10px] text-muted-foreground shadow-sm"
            role="status"
          >
            {notice}
          </span>
        )}
      </div>
      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open && !sending) {
            setPreview(null)
            setNotice('')
          }
        }}
      >
        <DialogContent>
          <DialogTitle>Send output to agent?</DialogTitle>
          <DialogDescription>
            Only this selected text will be sent to the active conversation.
            Review and remove secrets before continuing. No shell command will be run.
          </DialogDescription>
          <textarea
            aria-label="Terminal output to share"
            autoCapitalize="off"
            autoComplete="off"
            className="min-h-36 max-h-72 w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-[12px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
            spellCheck={false}
            value={preview ?? ''}
            onChange={(event) => setPreview(event.target.value)}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted-foreground">
              {terminalSelectionBytes(preview ?? '')} / {maxAgentSelectionBytes} bytes
            </span>
            <div className="flex gap-2">
              <Button
                disabled={sending}
                size="sm"
                variant="outline"
                onClick={() => { setPreview(null); setNotice('') }}
              >
                Cancel
              </Button>
              <Button
                disabled={sending || !preview?.trim() ||
                  terminalSelectionBytes(preview) > maxAgentSelectionBytes}
                size="sm"
                onClick={() => void send()}
              >
                {sending ? 'Sending…' : 'Send to agent'}
              </Button>
            </div>
          </div>
          {notice && <p className="text-[12px] text-error" role="alert">{notice}</p>}
        </DialogContent>
      </Dialog>
    </>
  )
}
