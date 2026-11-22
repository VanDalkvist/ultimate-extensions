type Modifiers = {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/**
 * On macOS use Command+F; on Linux/Windows use Ctrl+Shift+F.
 * Bash/readline Ctrl+F must always pass through to the PTY.
 * The platform string comes from the browser, not the server's OS.
 */
export function isTerminalFindShortcut(event: Modifiers, platform: string) {
  if (event.key.toLowerCase() !== 'f' || event.altKey) return false
  const mac = /^(?:Mac|iPad|iPhone|iPod)/i.test(platform)
  if (mac) return event.metaKey && !event.ctrlKey && !event.shiftKey
  return event.ctrlKey && event.shiftKey && !event.metaKey
}
