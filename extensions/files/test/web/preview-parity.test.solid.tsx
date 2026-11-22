import type { JSX } from '@solidjs/web'
import { expect, it, vi } from 'vitest'
import { Markdown } from '@/components/markdown/markdown.solid.tsx'
import { registry } from '@/sdk/client.ts'
import { renderSolid } from '@runtime/test/web/solid-dom-setup.ts'
import { MarkdownPreview } from '../../markdown-preview.solid.tsx'
import { previewReason } from '../../markdown-document.ts'
import { fixtures } from './preview-fixtures.ts'

function visibleStructure(node: Node): unknown {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent
  if (!(node instanceof HTMLElement)) return undefined
  const tag = node.matches('span.font-semibold') ? 'strong' : node.localName
  const attrs = {
    ...(node instanceof HTMLInputElement && { checked: node.checked, disabled: node.disabled }),
    ...(node instanceof HTMLOListElement && { start: node.start }),
    ...(node.style.textAlign && { align: node.style.textAlign }),
    ...(node.classList.contains('sr-only') && { hiddenLabel: true }),
  }
  const children =
    tag === 'pre'
      ? [...node.querySelectorAll('code > span')].map((line) => line.textContent)
      : [...node.childNodes]
          .map(visibleStructure)
          .filter((child) => child !== undefined)
          .reduce<unknown[]>((runs, child) => {
            const previous = runs.at(-1)
            if (typeof child === 'string' && typeof previous === 'string')
              runs[runs.length - 1] = previous + child
            else runs.push(child)
            return runs
          }, [])
          .flatMap((child) => {
            if (typeof child !== 'string') return [child]
            if (child.trim()) return [child.trim().replace(/\s+/g, ' ')]
            return node.matches('p, li, span') ? [' '] : []
          })
  return [tag, ...(Object.keys(attrs).length ? [attrs] : []), ...children]
}

function previewOutline(node: HTMLElement) {
  return [...node.childNodes]
    .map(visibleStructure)
    .map((child) => JSON.stringify(child))
    .join('\n')
}

function expectInert(node: HTMLElement) {
  expect(
    node.querySelector(
      'a, area, img, picture, svg, iframe, script, object, embed, form, link, style, video, audio, base, meta, [href], [src], [srcset], [ping], [action], [data-html-canary], [data-contributed]',
    ),
  ).toBeNull()
  expect(
    [...node.querySelectorAll('*')]
      .flatMap((el) => el.getAttributeNames())
      .filter((attr) => attr.startsWith('on')),
  ).toEqual([])
  const location = window.location.href
  for (const el of node.querySelectorAll('span')) el.click()
  expect(window.location.href).toBe(location)
}

it('does not treat prose after emphasis as an MDX statement', () => {
  expect(
    previewReason('research.md', '- **First slice:** import provided export, no network.'),
  ).toBeUndefined()
  expect(previewReason('research.md', 'import Widget from "widget"')).toContain('MDX')
  expect(previewReason('research.md', fixtures.research)).toBeTypeOf('string')
})

it('uses the original fence metadata for starting or hiding line numbers', () => {
  const preview = renderSolid(() => (
    <MarkdownPreview
      value={'```ts startLine=42\nnumbered\n```\n\n```ts noLineNumbers\nplain\n```'}
    />
  ))
  const [numbered, plain] = preview.querySelectorAll<HTMLElement>('pre > code')
  expect(numbered.style.getPropertyValue('counter-reset')).toBe('line 41')
  expect(numbered.firstElementChild?.className).toContain('counter-increment:line')
  expect(plain.style.getPropertyValue('counter-reset')).toBe('')
  expect(plain.firstElementChild?.className).not.toContain('counter-increment:line')
})

it('matches original Streamdown Preview and stays inert with transcript renderers installed', async () => {
  const contributed = vi.fn<() => JSX.Element>(() => (
    <span data-contributed>Unexpected contribution</span>
  ))
  registry.receiveSystem()
  await registry.setLoaders({
    'extensions/parity/web.solid.tsx': async () => ({
      default: { link: contributed, inlineCode: contributed, codeBlocks: { mermaid: contributed } },
    }),
  })
  const control = renderSolid(() => (
    <Markdown
      text={
        '[Link](#files/example.md) `inline-contribution-canary`\n\n```mermaid\ncode-contribution-canary\n```'
      }
    />
  ))
  expect(control.querySelectorAll('[data-contributed]')).toHaveLength(3)
  contributed.mockClear()
  const fetch = vi.spyOn(globalThis, 'fetch')
  try {
    for (const [id, value] of Object.entries(fixtures)) {
      const candidate = renderSolid(() => <MarkdownPreview value={value} />)
      expect(previewOutline(candidate)).toMatchSnapshot(id)
      expectInert(candidate)
    }
    const inert = renderSolid(() => <MarkdownPreview value={fixtures.inert} />)
    expect(inert.textContent).toContain('<div>raw-block-canary</div>')
    expect(inert.textContent).toContain('<strong data-html-canary>inline words</strong>')
    expect(inert.textContent).toContain('[Image: Asset]')
    expect(inert.textContent).toContain('[Image: not loaded]')
    expect(contributed).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  } finally {
    fetch.mockRestore()
    await registry.setLoaders({})
  }
})
