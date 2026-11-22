import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { markdownDocument, markdownManager, previewReason } from '../../markdown-document.ts'

describe('read-only Solid Markdown preview safety', () => {
  it('does not treat prose after emphasis as MDX', () => {
    expect(previewReason('research.md', '- **First slice:** import provided export, no network.'))
      .toBeUndefined()
    expect(previewReason('research.md', 'import Widget from "widget"')).toContain('MDX')
  })

  it('keeps rich content accessible in the parsed document without executing HTML', () => {
    const source =
      '1. **`advertising-playbooks`** — evidence contract.\n\n- **First slice:** import provided export, no network.\n\n[Link](https://example.com) ![Asset](https://example.com/image.png)\n\n<script>alert(1)</script>'
    expect(previewReason('research.md', source)).toBeTypeOf('string')
    const parsed = markdownManager.parse(markdownDocument(source).body)
    const serialized = JSON.stringify(parsed)
    expect(serialized).toContain('advertising-playbooks')
    expect(serialized).toContain('import provided export')
    expect(serialized).toContain('Asset')
  })

  it('Solid fallback has no executable HTML, network image, or navigation path', () => {
    const source = readFileSync(
      new URL('../../markdown-preview.solid.tsx', import.meta.url), 'utf8',
    )
    expect(source).not.toContain('innerHTML')
    expect(source).not.toContain('<script')
    expect(source).not.toContain('<img')
    expect(source).not.toContain('<a ')
    expect(source).not.toContain('window.open')
    expect(source).toContain('[Image:')
  })
})
