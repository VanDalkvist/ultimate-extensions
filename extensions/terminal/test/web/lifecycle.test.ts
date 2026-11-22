import { expect, test, vi } from 'vitest'
import { terminalViewLifecycle } from '../../lifecycle.ts'

test.each([
  ['agent', 'failed', false],
  ['agent', 'leave', false],
  ['agent', 'pagehide', false],
  ['agent', 'stop', true],
  ['user', 'failed', true],
  ['user', 'leave', false],
  ['user', 'pagehide', false],
  ['user', 'stop', true],
] as const)('%s-owned view %s closes the shell: %s', (owner, callback, closes) => {
  const abort = new AbortController()
  let current: { owner: typeof owner; secretToken: string; abort: AbortController } | null = {
    owner,
    secretToken: 'trial',
    abort,
  }
  const close = vi.fn<(secretToken: string) => Promise<{ ok: boolean }>>(async () => ({ ok: true }))
  const changed = vi.fn<(state: string, error: boolean) => void>()
  const lifecycle = terminalViewLifecycle({
    take() {
      const session = current
      current = null
      return session
    },
    close,
    changed,
  })
  lifecycle[callback]()
  expect(current).toBeNull()
  expect(abort.signal.aborted).toBe(true)
  expect(close.mock.calls).toEqual(closes ? [['trial']] : [])
  const [message, error] = changed.mock.calls[0]
  expect(message.includes('session may still be active')).toBe(!closes)
  expect(message.toLowerCase().includes('stopped')).toBe(closes)
  expect(error).toBe(!closes || callback === 'failed')
})

test('pagehide aborts the reader but does not request privileged PTY close', () => {
  const abort = new AbortController()
  let current: { owner: 'user'; secretToken: string; abort: AbortController } | null = {
    owner: 'user', secretToken: 'bounded-pty', abort,
  }
  const close = vi.fn(async () => ({ ok: true }))
  const lifecycle = terminalViewLifecycle({
    take() { const old = current; current = null; return old },
    close,
    changed() {},
  })
  lifecycle.pagehide()
  expect(abort.signal.aborted).toBe(true)
  expect(current).toBeNull()
  expect(close).not.toHaveBeenCalled()
})
