import { describe, expect, it, vi } from 'vitest'
import { Slice } from '@tiptap/pm/model'
import { createMarkdownEditor } from '../../markdown-editor.tsx'
import {
  markdownDocument,
  markdownManager,
  previewReason,
  serializeMarkdown,
} from '../../markdown-document.tsx'

const prefix = '\uFEFF---\r\ntitle: "Keep exactly"\r\ncustom: [one, two]\r\n---\r\n\r\n'
const image = '![diagram](https://example.com/picture.png "A diagram")'
const body = [
  '# A heading',
  '',
  'A **bold**, *italic*, ~~struck~~ paragraph with `inline code` and [a link](./guide.md "Guide").',
  '',
  `Before ${image} after.`,
  '',
  image,
  '',
  '- first',
  '',
  '- second',
  '',
  '## Tasks',
  '',
  '- [x] done',
  '- [ ] pending',
  '',
  '| Name | Value |',
  '| :--- | ---: |',
  '| alpha | **one** |',
  '',
  '````js',
  'const fence = "```"',
  '````',
  '',
].join('\n')

describe('Files rich Markdown', () => {
  it('edits and serializes the supported subset with exact frontmatter and inert image bytes', () => {
    expect(previewReason('guide.md', prefix + body)).toBeUndefined()
    const document = markdownDocument(prefix + body)
    expect(document).toEqual({ prefix, body })
    const parsed = markdownManager.parse(document.body)
    const serialized = serializeMarkdown(document.prefix, parsed)
    expect(serialized.startsWith(prefix)).toBe(true)
    expect(serialized).toContain(image)
    expect(serialized).toContain('[a link](./guide.md "Guide")')
    expect(serialized).toContain('- [x] done')
    expect(serialized).toContain('- [ ] pending')
    expect(serialized).toContain('const fence = "```"')
    expect(serialized).toContain('````js')
    expect(previewReason('guide.md', serialized)).toBeUndefined()
    expect(markdownManager.parse(markdownDocument(serialized).body)).toEqual(parsed)

    const onChange = vi.fn<(text: string) => void>()
    const { editor } = createMarkdownEditor({
      element: null,
      path: 'guide.md',
      value: prefix + body,
      onChange,
    })
    try {
      editor.view.dispatch(editor.state.tr.insertText('Edited ', 1))
      expect(onChange).toHaveBeenCalledOnce()
      const edited = onChange.mock.calls[0][0]
      expect(edited.startsWith(prefix + '# Edited A heading')).toBe(true)
      expect(edited).toContain(image)
      expect(previewReason('guide.md', edited)).toBeUndefined()
      expect(markdownManager.parse(markdownDocument(edited).body)).toEqual(
        markdownManager.parse(body.replace('# A heading', '# Edited A heading')),
      )
      const types = JSON.stringify(editor.getJSON())
      for (const type of ['table', 'taskList', 'codeBlock', 'link', 'image']) {
        expect(types).toContain(`"type":"${type}"`)
      }
    } finally {
      editor.destroy()
    }
  })

  it('keeps pasted block markers as literal paragraph text after emitting and reopening', () => {
    for (const text of [
      '# literal',
      '## literal',
      '- literal',
      '+ literal',
      '1. literal',
      '1) literal',
      '> literal',
      '---',
      '===',
      '    # literal',
      'first\n# literal',
      '| A | B |\n| --- | --- |',
    ]) {
      const onChange = vi.fn<(text: string) => void>()
      const session = createMarkdownEditor({
        element: null,
        path: 'guide.md',
        value: '',
        onChange,
      })
      try {
        // handlePaste dispatches the same literal-text transaction (no input rules).
        session.editor.view.dispatch(session.editor.state.tr.insertText(text, 1))
        expect(onChange).toHaveBeenCalledOnce()
        const emitted = onChange.mock.calls[0][0]
        const reopened = createMarkdownEditor({
          element: null,
          path: 'guide.md',
          value: emitted,
          onChange: vi.fn<(text: string) => void>(),
        })
        try {
          expect(reopened.editor.getJSON()).toEqual(session.editor.getJSON())
          expect(reopened.editor.getJSON().content?.[0].type).toBe('paragraph')
          expect(reopened.editor.getText()).toBe(text)
        } finally {
          reopened.editor.destroy()
        }
      } finally {
        session.editor.destroy()
      }
    }
  })

  it('pastes plain multiline clipboard text as paragraphs without parsing HTML', () => {
    const onChange = vi.fn<(text: string) => void>()
    const session = createMarkdownEditor({ element: null, path: 'guide.md', value: '', onChange })
    try {
      const event = {
        clipboardData: { getData: () => 'first\r\n\r\n<script>literal</script>' },
      } as unknown as ClipboardEvent
      session.editor.options.editorProps.handlePaste?.(session.editor.view, event, Slice.empty)
      expect(onChange).toHaveBeenCalledOnce()
      const emitted = onChange.mock.calls[0][0]
      const reopened = markdownManager.parse(markdownDocument(emitted).body)
      expect(reopened.content?.every((node) => node.type === 'paragraph')).toBe(true)
      expect(JSON.stringify(reopened)).toContain('first')
      expect(JSON.stringify(reopened)).toContain('<script>literal</script>')
    } finally {
      session.editor.destroy()
    }
  })

  it('rejects an unrepresentable edit before changing the document or emitting', () => {
    const onChange = vi.fn<(text: string) => void>()
    const onUnsupported = vi.fn<(reason: string | undefined) => void>()
    const session = createMarkdownEditor({
      element: null,
      path: 'guide.md',
      value: '`code`',
      onChange,
      onUnsupported,
    })
    try {
      const before = session.editor.getJSON()
      // Markdown code spans cannot preserve a literal newline (they parse as spaces).
      const code = session.editor.schema.marks.code.create()
      const replacement = session.editor.schema.text('two\nlines', [code])
      session.editor.view.dispatch(session.editor.state.tr.replaceWith(1, 5, replacement))
      expect(session.editor.getJSON()).toEqual(before)
      expect(onChange).not.toHaveBeenCalled()
      expect(onUnsupported).toHaveBeenLastCalledWith(
        'This edit cannot be represented safely in Markdown and was not applied. Use Source instead.',
      )
      session.editor.commands.setTextSelection(2)
      expect(onUnsupported).toHaveBeenCalledOnce()
      session.editor.view.dispatch(session.editor.state.tr.insertText('safe ', 1))
      expect(onChange).toHaveBeenCalledOnce()
      expect(onUnsupported).toHaveBeenLastCalledWith(undefined)
    } finally {
      session.editor.destroy()
    }
  })

  it('never emits on open, external reload, selection, readonly changes or a parent echo', () => {
    const onChange = vi.fn<(text: string) => void>()
    const session = createMarkdownEditor({
      element: null,
      path: 'guide.md',
      value: prefix + body,
      onChange,
    })
    try {
      const { editor } = session
      editor.view.updateState(
        editor.state.reconfigure({ plugins: editor.extensionManager.plugins }),
      )
      expect(onChange).not.toHaveBeenCalled()
      editor.commands.setTextSelection(3)
      editor.setEditable(false, false)
      editor.setEditable(true, false)
      session.receive('\uFEFF# External\r\n\r\nNew body.\r\n')
      expect(onChange).not.toHaveBeenCalled()
      expect(editor.getText()).toContain('External')
      editor.view.dispatch(editor.state.tr.insertText('User ', 1))
      expect(onChange).toHaveBeenCalledOnce()
      const emitted = onChange.mock.calls[0][0]
      expect(emitted.startsWith('\uFEFF# User External')).toBe(true)
      const state = editor.state
      session.receive(emitted)
      expect(editor.state).toBe(state)
      expect(onChange).toHaveBeenCalledOnce()
    } finally {
      session.editor.destroy()
    }
  })

  it('refuses unsafe or unsupported input rather than dropping its syntax', () => {
    for (const text of [
      '<script>alert(1)</script>',
      '<img src="https://example.com/track" onerror="alert(1)">',
      'Footnote[^1]\n\n[^1]: Note',
      ':::note\nA directive\n:::',
      'Inline $x + y$ math',
      '\\(x + y\\)',
      '\\[x + y\\]',
      'A [[wiki link]]',
      'A {custom} expression',
      '[reference][ref]\n\n[ref]: ./guide.md',
      '---\ntitle: unfinished',
    ]) {
      expect(previewReason('guide.md', text)).toBeTypeOf('string')
    }
    expect(previewReason('component.mdx', '# Plain heading')).toContain('MDX')
    // Tiptap/Marked drop checkboxes in mixed lists and cells beyond the header.
    expect(previewReason('guide.md', '- plain\n- [x] checked\n')).toBeTypeOf('string')
    expect(previewReason('guide.md', '| A | B |\n| --- | --- |\n| one | two | lost |')).toContain(
      'uneven',
    )
  })
})
