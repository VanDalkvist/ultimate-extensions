import { ActionError } from '@/sdk/solid'
import { readLongpollMs } from './refs.ts'

export async function readWithRetry<T>(read: () => Promise<T>, signal: AbortSignal) {
  try {
    return await read()
  } catch (error) {
    if (signal.aborted || !(error instanceof ActionError) || error.status !== 0) throw error
    // The failed fetch may still occupy the server's single reader slot.
    await new Promise<void>((resolve, reject) => {
      signal.throwIfAborted()
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abort)
        resolve()
      }, readLongpollMs)
      const abort = () => {
        clearTimeout(timer)
        reject(signal.reason)
      }
      signal.addEventListener('abort', abort, { once: true })
    })
    signal.throwIfAborted()
    return read()
  }
}
