import { createEffect, createSignal, onCleanup } from 'solid-js'
import { createMarkdownEditor, type MarkdownEditorProps } from './markdown-editor.ts'

export function MarkdownEditor(props: MarkdownEditorProps) {
  const [unsupported, setUnsupported] = createSignal<string>()
  let root!: HTMLDivElement
  let mounted: ReturnType<typeof createMarkdownEditor> | undefined
  createEffect(
    () => ({ path: props.path, value: props.value, editable: props.editable ?? true }),
    (next, previous) => {
      if (!mounted || next.path !== previous?.path) {
        mounted?.editor.destroy()
        setUnsupported(undefined)
        mounted = createMarkdownEditor({
          element: root,
          ...next,
          onChange: (text) => props.onChange(text),
          onUnsupported: setUnsupported,
        })
      } else {
        mounted.receive(next.value)
        if (next.editable !== previous.editable) mounted.editor.setEditable(next.editable, false)
      }
    },
  )
  onCleanup(() => mounted?.editor.destroy())

  return (
    <div>
      {unsupported() && (
        <p
          role="alert"
          class="mb-3 rounded-md border border-error/30 bg-error/5 p-3 text-[12px] text-error"
        >
          {unsupported()}
        </p>
      )}
      <div ref={root} data-files-markdown-editor />
    </div>
  )
}
