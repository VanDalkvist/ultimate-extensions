import { expect, it, vi } from 'vitest'
import { shellLaunch, shellOpenIntent } from '../../shell-launch.tsx'

const terminal = { cols: 80, rows: 24 }
const user = { owner: 'user' as const, secretToken: 'user-test-token' }
const agent = { owner: 'agent' as const, secretToken: 'agent-test-token' }

function surface() {
  let running = false
  const inspect = vi.fn<() => Promise<typeof agent | null>>().mockResolvedValue(null)
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
