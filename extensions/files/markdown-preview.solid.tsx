import type { JSONContent } from '@tiptap/core'
import { dynamic } from '@solidjs/web'
import { For, Match, Show, Switch, createMemo } from 'solid-js'
import { markdownDocument, markdownManager } from './markdown-document.ts'

/**
 * Read-only fallback for Markdown that the lossless Tiptap editor refuses.
 * Native Solid rendering only: no React Streamdown, innerHTML, external images,
 * active links, extensions or embedded scripts.
 */
function SafeNode(props: { node: JSONContent }) {
  const children = () => (
    <For each={props.node.content ?? []} keyed={false}>
      {(item) => <SafeNode node={item()} />}
    </For>
  )
  const text = () => props.node.text ?? ''
  const marks = () => new Set((props.node.marks ?? []).map((mark) => mark.type))
  const level = () => Math.max(1, Math.min(6, Number(props.node.attrs?.level) || 1))
  const Heading = dynamic(() => 'h' + level())

  return (
    <Switch fallback={<div>{children()}</div>}>
      <Match when={props.node.type === 'text'}>
        <Show when={!marks().has('code')} fallback={<code>{text()}</code>}>
          <Show when={!marks().has('bold')} fallback={<strong>{text()}</strong>}>
            <Show when={!marks().has('italic')} fallback={<em>{text()}</em>}>
              <Show when={!marks().has('strike')} fallback={<s>{text()}</s>}>
                {text()}
              </Show>
            </Show>
          </Show>
        </Show>
      </Match>
      <Match when={props.node.type === 'paragraph'}><p>{children()}</p></Match>
      <Match when={props.node.type === 'heading'}><Heading>{children()}</Heading></Match>
      <Match when={props.node.type === 'bulletList'}><ul>{children()}</ul></Match>
      <Match when={props.node.type === 'orderedList'}><ol>{children()}</ol></Match>
      <Match when={props.node.type === 'listItem'}><li>{children()}</li></Match>
      <Match when={props.node.type === 'taskList'}><ul>{children()}</ul></Match>
      <Match when={props.node.type === 'taskItem'}>
        <li>
          <span aria-label={props.node.attrs?.checked ? 'Completed task' : 'Incomplete task'}>
            {props.node.attrs?.checked ? '☑' : '☐'}
          </span>
          {children()}
        </li>
      </Match>
      <Match when={props.node.type === 'blockquote'}><blockquote>{children()}</blockquote></Match>
      <Match when={props.node.type === 'codeBlock'}>
        <pre><code>{(props.node.content ?? []).map((item) => item.text ?? '').join('')}</code></pre>
      </Match>
      <Match when={props.node.type === 'horizontalRule'}><hr /></Match>
      <Match when={props.node.type === 'hardBreak'}>{'\n'}</Match>
      <Match when={props.node.type === 'image'}>
        <span class="font-mono text-[12px] text-muted-foreground">
          [Image: {String(props.node.attrs?.alt ?? 'not loaded')}]
        </span>
      </Match>
      <Match when={props.node.type === 'table'}><table><tbody>{children()}</tbody></table></Match>
      <Match when={props.node.type === 'tableRow'}><tr>{children()}</tr></Match>
      <Match when={props.node.type === 'tableCell'}><td>{children()}</td></Match>
      <Match when={props.node.type === 'tableHeader'}><th>{children()}</th></Match>
    </Switch>
  )
}

export function MarkdownPreview(props: { value: string }) {
  const parsed = createMemo(() => {
    try {
      return markdownManager.parse(markdownDocument(props.value).body)
    } catch {
      return undefined
    }
  })
  return (
    <Show when={parsed()} fallback={
      <pre class="whitespace-pre-wrap break-words font-mono text-[12px]">{props.value}</pre>
    }>
      {(document) => (
        <div class="markdown min-w-0 wrap-anywhere" data-files-readonly-preview>
          <For each={document().content ?? []} keyed={false}>
            {(node) => <SafeNode node={node()} />}
          </For>
        </div>
      )}
    </Show>
  )
}
