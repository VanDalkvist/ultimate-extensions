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
  consume(request: { path: string }) {
    if (pending !== request) return
    pending = null
    publish()
  },
}

export function fileLinkPath(href: string) {
  if (!href.startsWith('#files/')) return undefined
  try {
    return decodeURIComponent(href.slice('#files/'.length))
  } catch {
    return null
  }
}

export function requestFile(path: string) {
  pending = { path }
  publish()
}
