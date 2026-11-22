type Modifiers = {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/** Keep Bash's Ctrl+F readline shortcut available on macOS and Linux. */
export function isTerminalFindShortcut(event: Modifiers) {
  if (event.key.toLowerCase() !== 'f' || event.altKey) return false
  return (event.metaKey && !event.ctrlKey && !event.shiftKey) ||
    (event.ctrlKey && event.shiftKey && !event.metaKey)
}
