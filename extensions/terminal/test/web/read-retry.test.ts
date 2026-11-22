import { readActionFailure } from '../../action-failure.ts'
import { afterEach, expect, test, vi } from 'vitest'
import { readWithRetry } from '../../read-retry.ts'
import { readLongpollMs } from '../../refs.ts'

const testFailure = (status: number, action = 'read', extension = 'terminal') =>
  Object.assign(new Error('synthetic failure'), { extension, action, status })
const transportLost = testFailure(0)
afterEach(() => vi.useRealTimers())

test('the output read survives one lost response without overlapping the previous poll', async () => {
  vi.useFakeTimers()
  const result = { cursor: 6, secretOutput: 'c2FtcGxl' }
  const read = vi
    .fn<() => Promise<typeof result>>()
    .mockRejectedValueOnce(transportLost)
    .mockResolvedValueOnce(result)
  const pending = readWithRetry(read, new AbortController().signal)
  await vi.advanceTimersByTimeAsync(readLongpollMs - 1)
  expect(read).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  await expect(pending).resolves.toEqual(result)
  expect(read).toHaveBeenCalledTimes(2)
})

test('the second transport failure ends the retry', async () => {
  vi.useFakeTimers()
  const read = vi.fn<() => Promise<never>>().mockRejectedValue(transportLost)
  await Promise.all([
    expect(readWithRetry(read, new AbortController().signal)).rejects.toBe(transportLost),
    vi.advanceTimersByTimeAsync(readLongpollMs * 2),
  ])
  expect(read).toHaveBeenCalledTimes(2)
})

test('a rejected read is not retried', async () => {
  const rejected = testFailure(500)
  const read = vi.fn<() => Promise<never>>().mockRejectedValue(rejected)
  await expect(readWithRetry(read, new AbortController().signal)).rejects.toBe(rejected)
  expect(read).toHaveBeenCalledTimes(1)
})

test('leaving the view cancels a scheduled retry', async () => {
  vi.useFakeTimers()
  const abort = new AbortController()
  const read = vi.fn<() => Promise<never>>().mockRejectedValue(transportLost)
  const pending = readWithRetry(read, abort.signal)
  await vi.advanceTimersByTimeAsync(0)
  abort.abort()
  await expect(pending).rejects.toHaveProperty('name', 'AbortError')
  await vi.advanceTimersByTimeAsync(readLongpollMs)
  expect(read).toHaveBeenCalledTimes(1)
})

test('only terminal read transport failures qualify for retry', () => {
  expect(readActionFailure(transportLost)).toBe('transport')
  expect(readActionFailure(testFailure(500))).toBe('rejected')
  expect(readActionFailure(testFailure(0, 'control'))).toBeNull()
  expect(readActionFailure(testFailure(0, 'read', 'other'))).toBeNull()
  expect(readActionFailure(new Error('fetch failed'))).toBeNull()
  expect(readActionFailure(null)).toBeNull()
})
