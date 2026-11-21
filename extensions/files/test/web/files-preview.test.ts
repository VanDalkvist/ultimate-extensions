import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { previewReason } from '../../markdown-document.tsx'
import { MarkdownPreview } from '../../markdown-preview.tsx'

describe('research document Preview regression', () => {
  it('does not treat prose after emphasis as an MDX statement', () => {
    expect(
      previewReason('research.md', '- **First slice:** import provided export, no network.'),
    ).toBeUndefined()
    expect(previewReason('research.md', 'import Widget from "widget"')).toContain('MDX')
  })

  it('renders Markdown that cannot be rich-edited without making active content', () => {
    // #62014: the real research file combines these two structures. The
    // bold/code marks still cannot round-trip through the rich editor schema.
    const source =
      '1. **`advertising-playbooks`** — evidence contract.\n\n- **First slice:** import provided export, no network.\n\n[Link](https://example.com) ![Asset](https://example.com/image.png)\n\n<script>alert(1)</script>'
    expect(previewReason('research.md', source)).toBeTypeOf('string')
    const output = renderToStaticMarkup(createElement(MarkdownPreview, { value: source }))
    expect(output).toContain('advertising-playbooks')
    expect(output).toContain('data-streamdown="strong"')
    expect(output).toContain('import provided export')
    expect(output).toContain('[Image: Asset]')
    expect(output).not.toMatch(/<(?:a|img|script)\b|\b(?:src|href)=/)
  })
})
