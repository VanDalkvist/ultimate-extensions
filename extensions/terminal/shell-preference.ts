import { useEffect, useState } from 'react'

import {
  shellPreferenceKey,
  readShellPreference,
  validShellPreference,
  writeShellPreference,
} from './shell-preference-store.ts'

const changedEvent = 'ultimate:terminal:default-shell-changed'

/**
 * Only a shell path is persisted (no terminal output, tokens or session data).
 * React Ultimate installations do not consistently expose Solid's
 * useExtensionUiState hook; localStorage works across reloads/browser tabs.
 * The server always revalidates this untrusted preference before spawning.
 */
function safeRead(): string {
  if (typeof window === 'undefined') return 'system'
  try { return readShellPreference(window.localStorage) } catch { return 'system' }
}

export function useTerminalShellPreference(): [string, (value: string) => void] {
  const [choice, setChoice] = useState(safeRead)

  useEffect(() => {
    function refresh() {
      setChoice(safeRead())
    }
    function onStorage(event: StorageEvent) {
      if (event.key === shellPreferenceKey || event.key === null) refresh()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(changedEvent, refresh)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(changedEvent, refresh)
    }
  }, [])

  function update(value: string) {
    if (!validShellPreference(value)) return
    setChoice(value)
    try {
      writeShellPreference(value, window.localStorage)
      window.dispatchEvent(new Event(changedEvent))
    } catch {
      // Private browsing may deny storage; current UI selection still works.
    }
  }
  return [choice, update]
}
