import { pace } from '../../../lib/timers.ts'
import { ActionError } from '@/sdk/solid'
import { readLongpollMs } from './refs.ts'

export async function readWithRetry<T>(read: () => Promise<T>, signal: AbortSignal) {
  try {
    return await read()
  } catch (error) {
    if (signal.aborted || !(error instanceof ActionError) || error.status !== 0) throw error
    // The failed fetch may still occupy the server's single reader slot.
    await pace(readLongpollMs, signal)
    signal.throwIfAborted()
    return read()
  }
}
