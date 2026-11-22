import type { ConversationId } from '@earendil-works/pi-durable'
import { createAgent } from '@ui-sdk/solid/agent'
import { createSignal, flush, Show } from 'solid-js'
import { expect, test, vi } from 'vitest'
import { renderSolid } from '../../../../../test/web/solid-dom-setup.ts'
import extension, { changeShellGrant } from '../../web.solid.tsx'

type FakeCore = { dispose(): void }

const { action, load, init, destroy } = vi.hoisted(() => ({
  action: vi.fn<(ref: { extension: string; name: string }, args: object) => Promise<null>>(),
  load: vi.fn<() => Promise<FakeCore>>(),
  init: vi.fn<() => Promise<void>>(),
  destroy: vi.fn<() => void>(),
}))

vi.mock('@wterm/ghostty', () => ({ GhosttyCore: { load } }))
vi.mock('@wterm/dom', () => ({
  WTerm: class {
    init = init
    destroy = destroy
  },
}))
vi.mock('@/sdk/solid', async (original) => ({
  ...(await original<typeof import('@/sdk/solid')>()),
  api: { action },
  Sidebar: () => null,
  Header: () => null,
  StatusLine: () => null,
  useConversationId: () => () => undefined,
}))

const Surface = extension.surfaces![0].component
const agent = createAgent()

test('Inspect waits for WTerm readiness and never runs after disposal', async () => {
  const lateInit = Promise.withResolvers<void>()
  const nextInit = Promise.withResolvers<void>()
  const inspected = Promise.resolve(null)
  const oldCore = { dispose: vi.fn<() => void>() }
  const newCore = { dispose: vi.fn<() => void>() }
  load.mockResolvedValueOnce(oldCore).mockResolvedValueOnce(newCore)
  init.mockReturnValueOnce(lateInit.promise).mockReturnValueOnce(nextInit.promise)
  action.mockReturnValue(inspected)

  const [visible, setVisible] = createSignal(true)
  const host = renderSolid(() => (
    <Show when={visible()}>
      <Surface />
    </Show>
  ))
  await Promise.resolve()
  expect(init).toHaveBeenCalledTimes(1)
  expect(action).not.toHaveBeenCalled()
  setVisible(false)
  flush()
  expect(destroy).toHaveBeenCalledTimes(1)
  expect(oldCore.dispose).toHaveBeenCalledTimes(1)
  lateInit.resolve()
  await lateInit.promise
  expect(action).not.toHaveBeenCalled()

  setVisible(true)
  flush()
  await Promise.resolve()
  expect(action).not.toHaveBeenCalled()
  nextInit.resolve()
  await nextInit.promise
  await inspected
  flush()
  expect(action.mock.calls).toEqual([[{ extension: 'terminal', name: 'inspect' }, {}]])
  expect(host.querySelector('[data-terminal-state]')?.textContent).toContain(
    'Ready · start a shell explicitly',
  )
  const start = host.querySelector('button')!
  expect(start.disabled).toBe(false)
  expect(host.querySelector('fieldset.wterm')?.getAttribute('aria-label')).toBe('Terminal')
  const result = await agent.act({ steps: [{ ref: 'Start shell', action: 'press' }] })
  expect(result.error?.message).toContain('Needs a person')
  start.click()
  expect(action).toHaveBeenCalledTimes(1)

  setVisible(false)
  flush()
  expect(destroy).toHaveBeenCalledTimes(2)
  expect(newCore.dispose).toHaveBeenCalledTimes(1)
})

test('revokes an active grant without a selected conversation but cannot create one', async () => {
  const grant = { conversation: 42 as ConversationId, expires: 300_000, generation: 'test-grant' }
  action.mockReset().mockResolvedValue(null)

  expect(changeShellGrant('test-token', null, undefined)).toBeUndefined()
  await changeShellGrant('test-token', grant, undefined)

  expect(action).toHaveBeenCalledExactlyOnceWith(
    { extension: 'terminal', name: 'revoke' },
    { secretToken: 'test-token' },
  )
})
