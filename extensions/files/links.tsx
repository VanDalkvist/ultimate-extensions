import type { ReactNode } from 'react'
import { useUltimate } from '@/sdk'

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

export function FileLink({
  href,
  children,
  core,
}: {
  href: string
  children: ReactNode
  core: ReactNode
}) {
  const { showSurface } = useUltimate()
  if (!href.startsWith('#files/')) return core
  let path: string
  try {
    path = decodeURIComponent(href.slice('#files/'.length))
  } catch {
    // A malformed escape must not fall through to the external-link renderer.
    return <span title="Invalid Files link encoding">{children} (invalid Files link)</span>
  }
  return (
    <a
      href={href}
      title={`Open ${path} in project Files`}
      onClick={(event) => {
        event.preventDefault()
        pending = { path }
        publish()
        showSurface('files')
      }}
    >
      {children}
    </a>
  )
}
