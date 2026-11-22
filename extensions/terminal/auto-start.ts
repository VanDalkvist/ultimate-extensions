/** Terminal is mounted only while its surface is selected.
 * Start once per visit after WTerm readiness and installed-shell validation.
 * shellLaunch inspects first; an existing PTY attaches instead of spawning.
 */
export function autoStartOnVisit(start: () => void) {
  let attempted = false
  return (terminalReady: boolean, validShell: boolean): boolean => {
    if (attempted || !terminalReady || !validShell) return false
    attempted = true
    start()
    return true
  }
}
