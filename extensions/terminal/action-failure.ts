/** Compatible with Ultimate builds that do not export ActionError from the Solid SDK.
 * Browser API failures are distinguished structurally; never require a private SDK class.
 */
export function readActionFailure(error: unknown): 'transport' | 'rejected' | null {
  if (!error || typeof error !== 'object') return null
  const candidate = error as {
    action?: unknown
    extension?: unknown
    status?: unknown
  }
  if (candidate.action !== 'read' || typeof candidate.status !== 'number') return null
  if (candidate.extension !== undefined && candidate.extension !== 'terminal') return null
  return candidate.status === 0 ? 'transport' : 'rejected'
}
