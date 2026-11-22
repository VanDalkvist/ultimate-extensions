import { Editor, Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { Fragment, Slice } from '@tiptap/pm/model'
import {
  markdownDocument,
  markdownExtensions,
  markdownManager,
  previewReason,
  serializeMarkdown,
} from './markdown-document.ts'

type MarkdownEditorProps = {
  path: string
  value: string
  onChange: (text: string) => void
  editable?: boolean
}

const unsupportedEdit =
  'This edit cannot be represented safely in Markdown and was not applied. Use Source instead.'

function content(path: string, value: string) {
  const reason = previewReason(path, value)
  if (reason) throw new Error(reason)
  const document = markdownDocument(value)
  const parsed = markdownManager.parse(document.body)
  // A ProseMirror document needs a block, even for an empty Markdown body.
  if (!parsed.content?.length) parsed.content = [{ type: 'paragraph' }]
  return { prefix: document.prefix, parsed }
}

// A null element uses Tiptap's headless state, exercising the same synchronization
// as the mounted component without a DOM test dependency.
export function createMarkdownEditor({
  element,
  path,
  value,
  onChange,
  editable = true,
  onUnsupported,
}: MarkdownEditorProps & {
  element: HTMLElement | null
  onUnsupported?: (reason: string | undefined) => void
}) {
  const initial = content(path, value)
  let prefix = initial.prefix
  let current = value
  let receiving = false
  const validationPlugin = new Plugin({
    filterTransaction(transaction) {
      if (receiving || !transaction.docChanged || !editor.options.editable) return true
      try {
        serializeMarkdown(prefix, transaction.doc.toJSON())
        return true
      } catch {
        // Reject before application: keep the existing safe document and
        // explain why the edit was refused instead of saving changed meaning.
        onUnsupported?.(unsupportedEdit)
        return false
      }
    },
  })
  const validation = Extension.create({
    name: 'losslessMarkdown',
    addProseMirrorPlugins: () => [validationPlugin],
  })
  const editor = new Editor({
    element,
    extensions: [...markdownExtensions, validation],
    injectCSS: false,
    content: initial.parsed,
    editable,
    editorProps: {
      attributes: {
        'aria-label': `Editing preview of ${path}`,
        class:
          'markdown relative min-h-48 whitespace-break-spaces wrap-anywhere outline-none text-foreground [&_.ProseMirror-gapcursor]:pointer-events-none [&_.ProseMirror-gapcursor]:absolute [&_.ProseMirror-gapcursor]:hidden [&_.ProseMirror-gapcursor]:h-px [&_.ProseMirror-gapcursor]:w-4 [&_.ProseMirror-gapcursor]:bg-foreground [&.ProseMirror-focused_.ProseMirror-gapcursor]:block [&_.ProseMirror-separator]:inline [&_.ProseMirror-separator]:size-0 [&_.ProseMirror-selectednode]:outline [&_.ProseMirror-selectednode]:outline-ring [&_[contenteditable=false]]:whitespace-normal [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-border/70 [&_pre]:bg-terminal [&_pre]:p-3 [&_code]:font-mono [&_code]:text-[0.9em] [&_:not(pre)>code]:rounded-sm [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border/70 [&_td]:px-3 [&_td]:py-1.5 [&_th]:border [&_th]:border-border/70 [&_th]:bg-muted/50 [&_th]:px-3 [&_th]:py-1.5 [&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0 [&_li[data-type=taskItem]]:flex [&_li[data-type=taskItem]]:items-baseline [&_li[data-type=taskItem]]:gap-2 [&_li[data-type=taskItem]>div]:min-w-0 [&_li[data-type=taskItem]>div]:flex-1 [&_li[data-type=taskItem]_p]:my-0',
        spellcheck: 'true',
      },
      handlePaste(view, event) {
        // Never parse clipboard HTML (including images or active attributes).
        const text = event.clipboardData?.getData('text/plain')
        if (!text || !view.editable) return true
        const plain = text.replace(/\r\n?/g, '\n')
        if (!plain.includes('\n') || view.state.selection.$from.parent.type.spec.code) {
          view.dispatch(view.state.tr.insertText(plain))
        } else {
          // Plain clipboard lines become paragraphs, not unrepresentable newlines inside one text node (#2840).
          const marks = view.state.storedMarks ?? view.state.selection.$from.marks()
          const paragraphs = plain
            .split('\n')
            .map((line) =>
              view.state.schema.nodes.paragraph.create(
                null,
                line ? view.state.schema.text(line, marks) : undefined,
              ),
            )
          view.dispatch(
            view.state.tr.replaceSelection(new Slice(Fragment.fromArray(paragraphs), 1, 1)),
          )
        }
        return true
      },
      handleDrop() {
        // Files and HTML drops are not supported Markdown input paths.
        return true
      },
    },
    onUpdate({ editor: updated, transaction }) {
      // A selection/focus transaction may append Tiptap's trailing paragraph;
      // that is not a user content edit and must never normalize the file on open.
      if (!transaction.docChanged || !updated.options.editable) return
      const next = serializeMarkdown(prefix, updated.getJSON())
      onUnsupported?.(undefined)
      if (next === current) return
      current = next
      onChange(next)
    },
  })
  // Tiptap installs extension plugins on mount; also validate native headless edits.
  if (!element) editor.registerPlugin(validationPlugin)
  return {
    editor,
    receive(next: string) {
      // The parent's echo of our own edit must not reset selection or history.
      if (next === current) return
      const incoming = content(path, next)
      prefix = incoming.prefix
      current = next
      receiving = true
      try {
        editor.commands.setContent(incoming.parsed, { emitUpdate: false })
      } finally {
        receiving = false
      }
      onUnsupported?.(undefined)
    },
  }
}

