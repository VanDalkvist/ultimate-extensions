import { Streamdown, defaultComponents, defaultRemarkPlugins } from 'streamdown'

// Read-only fallback for Markdown the rich editor cannot round-trip (#62014).
// No raw HTML pipeline, extension renderers, navigation or image requests.
const components = {
  ...defaultComponents,
  a: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  img: ({ alt }: { alt?: string }) => (
    <span className="font-mono text-[12px] text-muted-foreground">
      [Image: {alt || 'not loaded'}]
    </span>
  ),
}

export function MarkdownPreview({ value }: { value: string }) {
  return (
    <Streamdown
      mode="static"
      className="markdown min-w-0 wrap-anywhere"
      components={components}
      remarkPlugins={Object.values(defaultRemarkPlugins)}
      rehypePlugins={[]}
      skipHtml
      controls={false}
      plugins={{}}
    >
      {value}
    </Streamdown>
  )
}
