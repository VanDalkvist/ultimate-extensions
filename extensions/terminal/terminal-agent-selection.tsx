import type { ConversationId } from '@earendil-works/pi-durable'
import type { WTerm } from '@wterm/dom'
import { SendIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { api } from '@/sdk'
import {
  maxAgentSelectionBytes,
  terminalAgentSubmission,
  terminalSelectionBytes,
} from './terminal-agent-context.ts'

type Preview = { text: string; conversation: ConversationId }

export function TerminalAgentSelection({
  instance,
  conversation,
}: {
  instance: WTerm | null
  conversation?: ConversationId
}) {
  const cachedSelection = useRef<string | null>(null)
  const inFlight = useRef(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [notice, setNotice] = useState('')
  const [sending, setSending] = useState(false)
  const [deliveryUncertain, setDeliveryUncertain] = useState(false)
  const destinationChanged = preview !== null && preview.conversation !== conversation

  function capture() {
    // Pointer focus can clear the native selection. Keyboard activation has
    // no pointerdown, so click also has a fallback to getSelectionText().
    cachedSelection.current = instance?.getSelectionText() ?? null
  }

  function inspectSelection() {
    const selected = cachedSelection.current ?? instance?.getSelectionText()
    cachedSelection.current = null
    if (conversation === undefined) {
      setNotice('Choose a conversation first')
      return
    }
    if (!selected?.trim()) {
      setNotice('Select output first')
      return
    }
    if (terminalSelectionBytes(selected) > maxAgentSelectionBytes) {
      setNotice('Select up to 12 KiB')
      return
    }
    setNotice('')
    setDeliveryUncertain(false)
    // Freezes the destination: switching conversations cannot silently
    // redirect the selected terminal output.
    setPreview({ text: selected, conversation })
  }

  function dismiss() {
    if (inFlight.current) return
    setPreview(null)
    setNotice('')
    setDeliveryUncertain(false)
  }

  async function send() {
    if (!preview || inFlight.current || deliveryUncertain) return
    let prepared: ReturnType<typeof terminalAgentSubmission<ConversationId>>
    try {
      prepared = terminalAgentSubmission(preview, conversation)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Invalid terminal selection')
      return
    }
    // State updates are asynchronous; this lock prevents rapid double clicks
    // from scheduling two follow-up messages.
    inFlight.current = true
    setSending(true)
    setNotice('')
    try {
      await api.submit(prepared.message, 'followUp', prepared.conversation)
      setPreview(null)
      setNotice('Queued for agent')
    } catch {
      // A lost response does not prove the submit was rejected. Never
      // encourage a blind retry of potentially sensitive/duplicate text.
      setDeliveryUncertain(true)
      setNotice('Delivery not confirmed. Check the conversation before retrying.')
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }

  return (
    <>
      <div className="relative shrink-0">
        <Button
          aria-label="Share selected terminal output with agent"
          disabled={!instance || conversation === undefined}
          size="sm"
          title="Preview selected terminal output before sharing it; no shell access is granted"
          variant="ghost"
          onPointerDown={capture}
          onClick={inspectSelection}
        >
          <SendIcon className="size-3.5" />
          To agent
        </Button>
        {notice && preview === null && (
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
          if (!open) dismiss()
        }}
      >
        <DialogContent>
          <DialogTitle>Send selected output to agent?</DialogTitle>
          <DialogDescription>
            Only the text below, plus a short untrusted-data label, goes to this
            Ultimate conversation. Remove secrets before sending. This does not grant
            the agent shell access or run a command.
          </DialogDescription>
          <p className="font-mono text-[11px] text-muted-foreground">
            Destination · Conversation #{preview?.conversation}
          </p>
          {destinationChanged && (
            <p className="text-[12px] text-error" role="alert">
              Active conversation changed. Close the preview and select again.
            </p>
          )}
          <textarea
            aria-label="Terminal output to share"
            autoCapitalize="off"
            autoComplete="off"
            className="min-h-36 max-h-72 w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-[12px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
            spellCheck={false}
            value={preview?.text ?? ''}
            onChange={(event) => {
              const text = event.target.value
              setPreview((current) => current && { ...current, text })
            }}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted-foreground">
              {terminalSelectionBytes(preview?.text ?? '')} / {maxAgentSelectionBytes} bytes
            </span>
            <div className="flex gap-2">
              <Button disabled={sending} size="sm" variant="outline" onClick={dismiss}>
                Cancel
              </Button>
              <Button
                disabled={
                  sending ||
                  deliveryUncertain ||
                  destinationChanged ||
                  !preview?.text.trim() ||
                  terminalSelectionBytes(preview.text) > maxAgentSelectionBytes
                }
                size="sm"
                onClick={() => void send()}
              >
                {sending ? 'Sending…' : deliveryUncertain ? 'Check conversation' : 'Send to agent'}
              </Button>
            </div>
          </div>
          {notice && <p className="text-[12px] text-error" role="alert">{notice}</p>}
        </DialogContent>
      </Dialog>
    </>
  )
}
