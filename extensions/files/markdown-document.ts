import { decodeHtmlEntities, getSchema } from '@tiptap/core'
import type { JSONContent, MarkdownToken } from '@tiptap/core'
import { Image } from '@tiptap/extension-image'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { escapeTableCellPipes, TableKit } from '@tiptap/extension-table'
import { MarkdownManager } from '@tiptap/markdown'
import { StarterKit } from '@tiptap/starter-kit'

// Tiptap 3.33.1 always emits triple backticks, which corrupts code containing a
// closing fence (#5893). Choose a fence longer than any run in the code instead.
const Starter = StarterKit.extend({
  addExtensions() {
    return (this.parent?.() ?? []).map((extension) => {
      switch (extension.name) {
        case 'codeBlock':
          return extension.extend({
            renderMarkdown(node, helpers) {
              const text = helpers.renderChildren(node.content ?? [])
              const longest = Array.from(text.matchAll(/`+/g)).reduce(
                (length, match) => Math.max(length, match[0].length),
                2,
              )
              const fence = '`'.repeat(longest + 1)
              return `${fence}${node.attrs?.language ?? ''}\n${text}\n${fence}`
            },
          })
        case 'paragraph':
          return extension.extend({
            renderMarkdown(node, helpers, context) {
              const rendered = this.parent?.(node, helpers, context) ?? ''
              // Tiptap 3.33.1 escapes inline syntax but not block markers (#2840).
              // Literal pasted text otherwise reopens as a heading, list or rule.
              return rendered
                .replace(/^([ \t]{0,3})([#+>=:|-])/gm, '$1\\$2')
                .replace(/^([ \t]{0,3}\d{1,9})([.)])(?=[ \t]|$)/gm, '$1\\$2')
                .replace(/^(?:[ \t]{4,}|[ \t]*\t[ \t]*)/gm, (indent) =>
                  Array.from(indent, (char) => `&#${char.charCodeAt(0)};`).join(''),
                )
            },
            parseMarkdown(token, helpers) {
              // Tiptap 3.33.1 unwraps standalone images as blocks (#5893), but
              // ours are inline atoms and must stay inside their paragraph.
              if (token.tokens?.length === 1 && token.tokens[0].type === 'image') {
                return helpers.createNode('paragraph', undefined, helpers.parseInline(token.tokens))
              }
              return this.parent?.(token, helpers)
            },
          })
        case 'link':
          return extension.extend({
            renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, string> }) {
              // Keep the destination in the document, never in a navigable DOM href.
              return ['a', { title: HTMLAttributes.title || HTMLAttributes.href }, 0]
            },
          })
        default:
          return extension
      }
    })
  },
})

const InertImage = Image.extend({
  addAttributes() {
    return { ...this.parent?.(), markdown: { default: null, rendered: false } }
  },
  parseHTML() {
    // Clipboard HTML is deliberately not an image input path.
    return []
  },
  parseMarkdown(token, helpers) {
    return helpers.createNode('image', {
      src: token.href,
      alt: token.text,
      title: token.title,
      markdown: token.raw,
    })
  },
  renderMarkdown(node) {
    if (typeof node.attrs?.markdown !== 'string') throw new Error('Image has no original Markdown.')
    return node.attrs.markdown
  },
  renderHTML({ node }) {
    // Never put src (including local URLs) on a DOM element or create an img.
    return [
      'span',
      { class: 'font-mono text-[12px] text-muted-foreground', contenteditable: 'false' },
      `[Image: ${node.attrs.alt || 'not loaded'}]`,
    ]
  },
  addInputRules() {
    // Only parsed Markdown creates images, so every image has its original bytes.
    return []
  },
}).configure({ inline: true, resize: false })

export const markdownExtensions = [
  Starter.configure({
    link: { openOnClick: false, autolink: false, linkOnPaste: false },
    underline: false,
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  TableKit.configure({ table: { resizable: false } }),
  InertImage,
]

// Use one public manager for both the gate and editor; no DOM or HTML conversion.
export const markdownManager = new MarkdownManager({ extensions: markdownExtensions })
const schema = getSchema(markdownExtensions)

export function markdownDocument(text: string): { prefix: string; body: string; reason?: string } {
  const bom = text.startsWith('\uFEFF') ? '\uFEFF' : ''
  const rest = text.slice(bom.length)
  if (!/^---(?:\r?\n|$)/.test(rest)) return { prefix: bom, body: rest }
  const frontmatter = /^---\r?\n[\s\S]*?^(?:---|\.\.\.)(?:\r?\n|$)(?:[\t ]*\r?\n)*/m.exec(rest)
  if (!frontmatter) {
    return { prefix: bom, body: rest, reason: 'Unclosed frontmatter; edit it in Source.' }
  }
  return { prefix: bom + frontmatter[0], body: rest.slice(frontmatter[0].length) }
}

const supported = new Set([
  'space',
  'paragraph',
  'heading',
  'text',
  'escape',
  'strong',
  'em',
  'del',
  'link',
  'image',
  'list',
  'list_item',
  'taskList',
  'taskItem',
  'table',
  'blockquote',
  'hr',
  'code',
  'codespan',
  'br',
])

function tokenReason(tokens: MarkdownToken[]): string | undefined {
  for (const token of tokens) {
    if (!supported.has(token.type ?? '')) {
      return token.type === 'html'
        ? 'Raw HTML is Source-only; Preview never executes HTML.'
        : `Unsupported Markdown token (${token.type ?? 'unknown'}); use Source.`
    }
    if (token.type === 'table') {
      // Marked drops surplus cells before parsing (#5893). Count source columns,
      // using Tiptap's public helper to protect code-span and escaped pipes.
      const rows = (token.raw ?? '').trim().split('\n').slice(2)
      if (
        rows.some((row) => {
          const cells = escapeTableCellPipes(row)
            .replace(/\\./g, 'x')
            .trim()
            .replace(/^\||\|$/g, '')
            .split('|')
          return cells.length !== token.header.length
        })
      )
        return 'Tables with uneven row lengths are Source-only.'
    }
    if (token.type === 'escape' && /^\\[([]/.test(token.raw ?? '')) {
      return 'Escaped math delimiters are Source-only.'
    }
    // MDX statements start at a block boundary, not at an inline leaf after
    // emphasis (e.g. "**First slice:** import provided export", #62014).
    if (
      (token.type === 'paragraph' || token.type === 'text') &&
      token.tokens &&
      /^\s*(?:import|export)\s/m.test(token.raw ?? '')
    ) {
      return 'MDX statements are Source-only.'
    }
    if (token.type === 'text' && !token.tokens) {
      // These extensions are plain text to the GFM parser, not editable syntax.
      // Conservative refusal is preferable to silently changing their meaning.
      const raw = token.raw ?? ''
      if (/\[\^|\$|\\[([]|:{2,}|:[\w-]+\[|\[\[|[{}]/m.test(raw)) {
        return 'Math, footnotes, directives, MDX and custom syntax are Source-only.'
      }
    }
    const children = [
      ...(token.tokens ?? []),
      ...(token.items ?? []),
      ...(token.nestedTokens ?? []),
      ...(token.header ?? []).flatMap((cell: MarkdownToken) => cell.tokens ?? []),
      ...(token.rows ?? []).flatMap((row: MarkdownToken[]) =>
        row.flatMap((cell) => cell.tokens ?? []),
      ),
    ]
    const reason = tokenReason(children)
    if (reason) return reason
  }
  return undefined
}

// Compare meaning, not delimiter choices, list markers, blank lines or CRLF.
// Unlike comparing only parsed JSON, this also catches content dropped on parse.
function meaning(tokens: MarkdownToken[]): unknown[] {
  return tokens
    .flatMap((token): unknown[] => {
      const type = token.type
      const children = () => meaning(token.tokens ?? [])
      switch (type) {
        case 'space':
          return []
        case 'escape':
          return [{ type: 'text', text: decodeHtmlEntities(token.text ?? '') }]
        case 'text':
          return token.tokens ? children() : [{ type, text: decodeHtmlEntities(token.text ?? '') }]
        case 'paragraph':
          return [{ type, children: children() }]
        case 'heading':
          return [{ type, depth: token.depth, children: children() }]
        case 'link':
          return [{ type, href: token.href, title: token.title || null, children: children() }]
        case 'image':
          return [{ type, href: token.href, title: token.title || null, text: token.text }]
        case 'code':
          return [{ type, lang: token.lang || null, text: token.text }]
        case 'codespan':
          return [{ type, text: token.text }]
        case 'list':
          return [
            {
              type,
              ordered: token.ordered,
              start: token.ordered ? token.start : null,
              items: meaning(token.items ?? []),
            },
          ]
        case 'list_item':
          return [
            {
              type,
              checked: token.checked ?? null,
              // Marked calls the same paragraph "text" in a tight list and
              // "paragraph" in a loose one; spacing normalization is allowed.
              children: meaning(
                (token.tokens ?? []).map((child) =>
                  child.type === 'text' && child.tokens ? { ...child, type: 'paragraph' } : child,
                ),
              ),
            },
          ]
        case 'taskList':
          return [{ type, items: meaning(token.items ?? []) }]
        case 'taskItem':
          return [
            {
              type,
              checked: token.checked,
              children: children(),
              nested: meaning(token.nestedTokens ?? []),
            },
          ]
        case 'table':
          return [
            {
              type,
              align: token.align,
              header: (token.header ?? []).map((cell: MarkdownToken) => meaning(cell.tokens ?? [])),
              rows: (token.rows ?? []).map((row: MarkdownToken[]) =>
                row.map((cell) => meaning(cell.tokens ?? [])),
              ),
            },
          ]
        default:
          return [{ type, children: children() }]
      }
    })
    .reduce<unknown[]>((result, item) => {
      // Escapes and entity normalization may split a single text token.
      const previous = result.at(-1) as { type?: string; text?: string } | undefined
      const current = item as { type?: string; text?: string }
      if (previous?.type === 'text' && current.type === 'text') previous.text += current.text ?? ''
      else result.push(item)
      return result
    }, [])
}

function lex(body: string) {
  return new markdownManager.instance.Lexer(markdownManager.instance.defaults).lex(body)
}

export function previewReason(path: string, text: string): string | undefined {
  if (/\.mdx$/i.test(path)) return 'MDX is Source-only; Preview supports Markdown, not components.'
  const document = markdownDocument(text)
  if (document.reason) return document.reason
  if (!document.body.trim()) return undefined
  try {
    const tokens = lex(document.body)
    if (Object.keys(tokens.links).length)
      return 'Reference link definitions are Source-only; use inline links for Preview.'
    const reason = tokenReason(tokens)
    if (reason) return reason
    const parsed = markdownManager.parse(document.body)
    schema.nodeFromJSON(parsed).check()
    const normalized = markdownManager.serialize(parsed)
    if (JSON.stringify(meaning(tokens)) !== JSON.stringify(meaning(lex(normalized)))) {
      return 'This Markdown structure cannot be edited losslessly in Preview; use Source.'
    }
    const roundTrip = markdownManager.parse(normalized)
    schema.nodeFromJSON(roundTrip).check()
    if (
      JSON.stringify(schema.nodeFromJSON(parsed).toJSON()) !==
      JSON.stringify(schema.nodeFromJSON(roundTrip).toJSON())
    ) {
      return 'This Markdown structure cannot be edited losslessly in Preview; use Source.'
    }
  } catch {
    // Refuse parser/schema failures rather than expose a lossy editor (#5893).
    return 'This Markdown cannot be safely edited in Preview; use Source.'
  }
  return undefined
}

function documentMeaning(content: JSONContent): string {
  // The editor supplies the schema's required empty paragraph for an empty body.
  const document = content.content?.length
    ? content
    : { ...content, content: [{ type: 'paragraph' }] }
  const node = schema.nodeFromJSON(document)
  node.check()
  const normalize = (value: JSONContent): JSONContent => ({
    ...value,
    ...(value.content && {
      // Blank-line counts are Markdown formatting, including Tiptap's trailing
      // empty paragraph. All other structure and attributes must match.
      content: value.content
        .filter((child) => child.type !== 'paragraph' || child.content?.length)
        .flatMap((child) => {
          if (child.type !== 'text' || !child.marks?.length) return [normalize(child)]
          const { marks, ...rest } = child
          // Tiptap 3.33.1 moves whitespace outside emphasis delimiters (#2840).
          // Ignore only that formatting, never code/link marks or any text.
          return (child.text?.match(/\s+|\S+/g) ?? []).map((text) => {
            const kept = /\S/.test(text)
              ? marks
              : marks.filter((mark) => !['bold', 'italic', 'strike'].includes(mark.type))
            return { ...rest, text, ...(kept.length && { marks: kept }) }
          })
        }),
    }),
  })
  // nodeFromJSON supplies schema defaults and rejoins adjacent equal text runs.
  return JSON.stringify(schema.nodeFromJSON(normalize(node.toJSON())).toJSON())
}

export function serializeMarkdown(prefix: string, content: JSONContent): string {
  const body = markdownManager.serialize(content)
  if (documentMeaning(content) !== documentMeaning(markdownManager.parse(body))) {
    throw new Error('This edit cannot be represented losslessly as Markdown.')
  }
  return prefix + body
}
