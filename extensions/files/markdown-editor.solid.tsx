import { createEffect, createSignal, onSettled } from 'solid-js'
import { createMarkdownEditor } from './markdown-editor.ts'

type Props = {
  path: string
  value: string
  onChange(text: string): void
  editable?: boolean
}

/** Mount the same lossless Tiptap editor without the removed React adapter. */
export function MarkdownEditor(props: Props) {
  const [unsupported, setUnsupported] = createSignal<string | undefined>()
  let element: HTMLDivElement | undefined
  let session: ReturnType<typeof createMarkdownEditor> | null = null

  onSettled(() => {
    if (!element) return
    setUnsupported(undefined)
    const active = createMarkdownEditor({
      element,
      path: props.path,
      value: props.value,
      editable: props.editable ?? true,
      onChange: (text) => props.onChange(text),
      onUnsupported: setUnsupported,
    })
    session = active
    return () => {
      session = null
      active.editor.destroy()
    }
  })

  createEffect(() => props.value, (value) => {
    session?.receive(value)
  })
  createEffect(() => props.editable ?? true, (editable) => {
    session?.editor.setEditable(editable, false)
  })

  return (
    <div>
      {unsupported() && (
        <p role="alert"
          class="mb-3 rounded-md border border-error/30 bg-error/5 p-3 text-[12px] text-error">
          {unsupported()}
        </p>
      )}
      <div ref={element} data-files-markdown-editor />
    </div>
  )
}
