import { dynamic } from '@solidjs/web'
import type { Element, RootContent } from 'hast'
import { For, createMemo } from 'solid-js'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'

const parser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, {
    handlers: {
      html: (_state, node) => ({ type: 'text', value: node.value }),
    },
  })

const classes = {
  em: undefined,
  del: undefined,
  br: undefined,
  h1: 'mt-6 mb-2 font-semibold text-3xl',
  h2: 'mt-6 mb-2 font-semibold text-2xl',
  h3: 'mt-6 mb-2 font-semibold text-xl',
  h4: 'mt-6 mb-2 font-semibold text-lg',
  h5: 'mt-6 mb-2 font-semibold text-base',
  h6: 'mt-6 mb-2 font-semibold text-sm',
  ul: 'list-inside list-disc whitespace-normal [li_&]:pl-6',
  blockquote: 'my-4 border-muted-foreground/30 border-l-4 pl-4 text-muted-foreground italic',
  hr: 'my-6 border-border',
  thead: 'bg-muted/80',
  tr: 'border-border',
  tbody: 'divide-y divide-border',
  sup: 'text-sm',
  sub: 'text-sm',
  section: 'footnotes',
}

function CodeBlock(props: { node: Element }) {
  const code = createMemo(() =>
    props.node.children.find(
      (node): node is Element => node.type === 'element' && node.tagName === 'code',
    ),
  )
  const language = () => {
    const names = code()?.properties.className
    return Array.isArray(names) ? (names[0] ?? '').replace(/^language-/, '') : ''
  }
  const numbering = createMemo(() => {
    const meta = code()?.data?.meta
    if (typeof meta !== 'string') return { show: true, reset: undefined }
    const start = Number(meta.match(/startLine=(\d+)/)?.[1])
    return {
      show: !/\bnoLineNumbers\b/.test(meta),
      reset: Number.isSafeInteger(start) && start > 1 ? `line ${start - 1}` : undefined,
    }
  })
  const lines = () =>
    code()
      ?.children.map((node) => (node.type === 'text' ? node.value : ''))
      .join('')
      .replace(/\n$/, '')
      .split('\n')
  return (
    <div
      class="relative my-4 flex w-full flex-col gap-2 rounded-xl border border-border bg-sidebar p-2 [content-visibility:auto] [contain-intrinsic-size:auto_200px]"
      dir="ltr"
    >
      <div class="flex h-8 items-center text-xs text-muted-foreground">
        <span class="ml-1 font-mono lowercase">{language()}</span>
      </div>
      <div class="max-h-[400px] overflow-auto rounded-md border border-border bg-background p-4 text-sm">
        <pre>
          <code
            class={numbering().show ? '[counter-reset:line]' : undefined}
            style={{ 'counter-reset': numbering().show ? numbering().reset : undefined }}
          >
            <For each={lines()}>
              {(line) => (
                <span
                  class={
                    numbering().show
                      ? 'block before:mr-4 before:inline-block before:w-6 before:text-right before:font-mono before:text-[13px] before:text-muted-foreground/50 before:select-none before:[counter-increment:line] before:content-[counter(line)]'
                      : 'block'
                  }
                >
                  {line || '\n'}
                </span>
              )}
            </For>
          </code>
        </pre>
      </div>
    </div>
  )
}

function renderElement(node: Element) {
  const children = () => <Nodes nodes={node.children} />
  const tag = node.tagName
  switch (tag) {
    case 'a':
      return <span>{children()}</span>
    case 'img':
      return (
        <span class="font-mono text-[12px] text-muted-foreground">
          [Image: {node.properties.alt || 'not loaded'}]
        </span>
      )
    case 'input':
      return node.properties.type === 'checkbox' ? (
        <input type="checkbox" disabled checked={node.properties.checked === true} />
      ) : null
    case 'strong':
      return <span class="font-semibold">{children()}</span>
    case 'ol':
      return (
        <ol
          class="list-inside list-decimal whitespace-normal [li_&]:pl-6"
          start={typeof node.properties.start === 'number' ? node.properties.start : undefined}
        >
          {children()}
        </ol>
      )
    case 'li': {
      const content = node.children.filter((child) => child.type !== 'text' || child.value.trim())
      const [only] = content
      const items =
        content.length === 1 && only.type === 'element' && only.tagName === 'p'
          ? only.children
          : node.children
      return (
        <li class="py-1 [&>p]:inline">
          <Nodes nodes={items} />
        </li>
      )
    }
    case 'p': {
      const [only] = node.children
      return node.children.length === 1 && only.type === 'element' && only.tagName === 'img' ? (
        children()
      ) : (
        <p>{children()}</p>
      )
    }
    case 'code':
      return <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">{children()}</code>
    case 'pre':
      return <CodeBlock node={node} />
    case 'table':
      return (
        <div class="my-4 flex flex-col gap-2 rounded-lg border border-border bg-sidebar p-2">
          <div class="max-h-[300px] overflow-auto rounded-md border border-border bg-background">
            <table class="w-full divide-y divide-border">{children()}</table>
          </div>
        </div>
      )
    case 'th':
    case 'td': {
      const Tag = dynamic(() => tag)
      const { align } = node.properties
      const textAlign =
        align === 'right' || align === 'center' || align === 'left' ? align : undefined
      return (
        <Tag
          class={
            tag === 'th'
              ? 'whitespace-nowrap px-4 py-2 text-left font-semibold text-sm'
              : 'px-4 py-2 text-sm'
          }
          style={{ 'text-align': textAlign }}
        >
          {children()}
        </Tag>
      )
    }
    default: {
      if (!Object.hasOwn(classes, tag)) return null
      const name = tag as keyof typeof classes
      const Tag = dynamic(() => name)
      return (
        <Tag
          class={
            name === 'h2' && node.properties.id === 'footnote-label' ? 'sr-only' : classes[name]
          }
        >
          {children()}
        </Tag>
      )
    }
  }
}

function Nodes(props: { nodes: RootContent[] }) {
  return (
    <For each={props.nodes}>
      {(node) =>
        node.type === 'text' ? node.value : node.type === 'element' ? renderElement(node) : null
      }
    </For>
  )
}

export function MarkdownPreview(props: { value: string }) {
  const tree = createMemo(() => parser.runSync(parser.parse(props.value)))
  return (
    <div class="space-y-4 whitespace-normal [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 markdown min-w-0 wrap-anywhere">
      <Nodes nodes={tree().children} />
    </div>
  )
}
