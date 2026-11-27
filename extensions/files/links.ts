// A click can precede the Files surface mounting. Keep it tab-local, like the file buffers.
let pending: { path: string } | null = null
const listeners = new Set<() => void>()
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
function publish() {
  for (const listener of listeners) listener()
}
export const fileRequests = {
  subscribe,
  get: () => pending,
  request(path: string) {
    pending = { path }
    publish()
  },
  consume(request: { path: string }) {
    if (pending !== request) return
    pending = null
    publish()
  },
}

export function fileMarkdownLink(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const label = name.replace(/[\\[\]\\`*_<>~!&]/g, '\\$&').replace(/\s/g, ' ')
  const href = path
    .split('/')
    .map((segment) =>
      encodeURIComponent(segment).replace(/[()]/g, (char) => (char === '(' ? '%28' : '%29')),
    )
    .join('/')
  return `[${label}](#files/${href})`
}

export function fileLinkPath(href: string): string | null | undefined {
  if (!href.startsWith('#files/')) return undefined
  try {
    return decodeURIComponent(href.slice('#files/'.length))
  } catch (error) {
    if (error instanceof URIError) return null
    throw error
  }
}
