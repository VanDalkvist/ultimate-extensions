import { expect, it, vi } from 'vitest'
import { shellLaunch, shellOpenIntent } from '../../shell-launch.ts'

const terminal = { cols: 80, rows: 24 }
const user = { owner: 'user' as const, secretToken: 'user-test-token' }
const agent = { owner: 'agent' as const, secretToken: 'agent-test-token' }

function surface() {
  let running = false
  const inspect = vi.fn<() => Promise<typeof user | typeof agent | null>>().mockResolvedValue(null)
  const open = vi.fn<(size: typeof terminal) => Promise<typeof user>>().mockResolvedValue(user)
  const attach = vi.fn<(value: typeof user | typeof agent) => void>(() => {
    running = true
  })
  const close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  const launch = shellLaunch({
    inspect,
    open,
    attach,
    close,
    running: () => running,
    busy: vi.fn<() => void>(),
    changed: vi.fn<() => void>(),
  })
  launch.connect()
  return {
    launch,
    inspect,
    open,
    attach,
    close,
    stop: () => {
      running = false
    },
  }
}

it('hands a titlebar click to the cold surface once, after Inspect and readiness', async () => {
  const intent = shellOpenIntent()
  const view = surface()
  const inspected = Promise.withResolvers<typeof agent | null>()
  view.inspect.mockReturnValueOnce(inspected.promise)
  let disconnect!: () => void
  intent.request(() => {
    intent.routeCommitted()
    disconnect = intent.connect(view.launch.request)
  })
  expect(view.inspect).not.toHaveBeenCalled()
  disconnect()
  view.launch.disconnect()
  view.launch.connect()
  disconnect = intent.connect(view.launch.request)
  view.launch.ready(terminal)
  expect(view.inspect).toHaveBeenCalledOnce()
  expect(view.open).not.toHaveBeenCalled()
  inspected.resolve(null)
  await Promise.resolve()
  expect(view.open).toHaveBeenCalledExactlyOnceWith(terminal)
  await Promise.resolve()
  expect(view.attach).toHaveBeenCalledOnce()

  const navigate = vi.fn<() => void>()
  intent.request(navigate)
  expect(navigate).toHaveBeenCalledOnce()
  view.stop()
  await Promise.resolve()
  expect(view.open).toHaveBeenCalledOnce()

  disconnect()
  view.launch.disconnect()
  const passive = surface()
  intent.connect(passive.launch.request)
  passive.launch.ready(terminal)
  await Promise.resolve()
  expect(passive.inspect).toHaveBeenCalledOnce()
  expect(passive.open).not.toHaveBeenCalled()
})

it('uses a discovered agent attachment rather than racing it with a user launch', async () => {
  const view = surface()
  const inspected = Promise.withResolvers<typeof agent | null>()
  view.inspect.mockReturnValueOnce(inspected.promise)
  view.launch.ready(terminal)
  view.launch.request()
  inspected.resolve(agent)
  await Promise.resolve()
  expect(view.open).not.toHaveBeenCalled()
  expect(view.attach).toHaveBeenCalledOnce()
  expect(view.attach.mock.calls[0][0]).toBe(agent)
})

it('does not carry a requested launch over from a discarded ready terminal', async () => {
  const view = surface()
  const inspected = Promise.withResolvers<null>()
  view.inspect.mockReturnValueOnce(inspected.promise)
  view.launch.ready(terminal)
  view.launch.request()
  view.launch.disconnect()
  view.launch.connect()
  inspected.resolve(null)
  await Promise.resolve()
  view.launch.ready({ ...terminal })
  await Promise.resolve()
  expect(view.open).not.toHaveBeenCalled()
})


it('reattaches a manually started shell after the Terminal surface remounts', async () => {
  const first = surface()
  first.launch.ready(terminal)
  await Promise.resolve()
  first.launch.request()
  await Promise.resolve()
  expect(first.open).toHaveBeenCalledOnce()
  first.launch.disconnect()
  first.stop()

  const second = surface()
  second.inspect.mockResolvedValueOnce(user)
  second.launch.ready(terminal)
  await Promise.resolve()
  expect(second.attach).toHaveBeenCalledOnce()
  expect(second.attach.mock.calls[0][0]).toBe(user)
  expect(second.open).not.toHaveBeenCalled()

  // "Open shell" is a navigation intent, not a second PTY launch.
  const third = surface()
  third.inspect.mockResolvedValueOnce(user)
  third.launch.ready(terminal)
  third.launch.request()
  await Promise.resolve()
  expect(third.attach).toHaveBeenCalledOnce()
  expect(third.open).not.toHaveBeenCalled()
})

it('returns from browser pagehide to an existing PTY without starting a duplicate', async () => {
  const view = surface()
  view.inspect.mockResolvedValue(user)
  view.launch.ready(terminal)
  await Promise.resolve()
  expect(view.attach).toHaveBeenCalledOnce()
  expect(view.open).not.toHaveBeenCalled()

  // pagehide detaches the reader, but the native PTY remains alive.
  view.stop()
  view.launch.hide()
  view.launch.show()
  await Promise.resolve()
  expect(view.inspect).toHaveBeenCalledTimes(2)
  expect(view.attach).toHaveBeenCalledTimes(2)
  expect(view.open).not.toHaveBeenCalled()
})

it('restores an interrupted inspect after BFCache pageshow and consumes one user launch', async () => {
  const view = surface()
  const first = Promise.withResolvers<typeof user | null>()
  view.inspect.mockReturnValueOnce(first.promise)
  view.launch.ready(terminal)
  view.launch.hide()
  view.launch.show()
  view.launch.request() // one deliberate entry; first inspect is obsolete
  first.resolve(null)
  await Promise.resolve()
  await Promise.resolve()
  expect(view.inspect).toHaveBeenCalledTimes(2)
  await Promise.resolve()
  expect(view.open).toHaveBeenCalledOnce()
})

it('preserves a user return while a stale Open is being closed after pagehide', async () => {
  const view = surface()
  const oldOpen = Promise.withResolvers<typeof user>()
  view.open.mockReturnValueOnce(oldOpen.promise)
  view.launch.ready(terminal)
  view.launch.request()
  await Promise.resolve()
  expect(view.open).toHaveBeenCalledOnce()

  // The old opened capability becomes an orphan after browser pagehide.
  view.launch.hide()
  view.launch.show()
  view.launch.request()
  oldOpen.resolve(user)
  await Promise.resolve()
  await Promise.resolve()
  expect(view.close).toHaveBeenCalledOnce()
  expect(view.open).toHaveBeenCalledTimes(2)
  expect(view.attach).toHaveBeenCalledOnce()
})
