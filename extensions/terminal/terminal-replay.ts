/** The browser's back/forward cache preserves the WTerm DOM.
 * Only reuse the last rendered cursor when the native PTY identity matches.
 * Never store capabilities/tokens or skip output on a fresh emulator mount.
 */
export type TerminalResumeSnapshot = {
  sessionId: string
  cursor: number
}

export function terminalResumePlan(
  opened: TerminalResumeSnapshot,
  retained: TerminalResumeSnapshot | null,
  existing: boolean,
): { cursor: number; replayHistory: boolean; resetOldScreen: boolean } {
  const sameSession = existing && retained?.sessionId === opened.sessionId
  return {
    cursor: sameSession ? Math.max(opened.cursor, retained.cursor) : opened.cursor,
    replayHistory: existing && !sameSession,
    resetOldScreen: retained !== null && !sameSession,
  }
}

/** A cursor is reusable only if the same DOM emulator has rendered history. */
export function captureRenderedSnapshot(
  running: {
    sessionId: string
    renderedCursor: number
    screenInitialized: boolean
  } | null,
): TerminalResumeSnapshot | null {
  return running?.screenInitialized
    ? { sessionId: running.sessionId, cursor: running.renderedCursor }
    : null
}
