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
