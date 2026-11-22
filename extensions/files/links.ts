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

export function fileLinkPath(href: string): string | null | undefined {
  if (!href.startsWith('#files/')) return undefined
  try {
    return decodeURIComponent(href.slice('#files/'.length))
  } catch (error) {
    if (error instanceof URIError) return null
    throw error
  }
}
