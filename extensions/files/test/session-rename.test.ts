import { afterEach, expect, test, vi } from 'vitest'
import { createSession } from '../session.ts'

const { action } = vi.hoisted(() => ({
  action: vi.fn<(name: string, args: unknown) => Promise<unknown>>(),
}))
vi.mock('@/sdk/solid', () => ({
  actionRef: (_extension: string, name: string) => name,
  api: { action },
  errorMessage: String,
}))

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  action.mockReset()
})

function useTestStorage() {
  vi.useFakeTimers()
  const storage = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  })
}

test('a folder rename holds autosave and resumes the same draft at the confirmed path', async () => {
  useTestStorage()
  const source = 'notes/a.md'
  const destination = 'renamed/a.md'
  let finish: () => void = () => {
    throw new Error('Rename did not start')
  }
  const rename = new Promise<{ path: string }>((resolve) => {
    finish = () => resolve({ path: 'renamed' })
  })
  action.mockResolvedValueOnce({
    path: source,
    secretText: 'original',
    version: 'before',
    identity: 'before-identity',
    bytes: 8,
  })
  const files = createSession('/fixture')
  files.open(source)
  files.load(files.get().tabs)
  await vi.advanceTimersByTimeAsync(0)
  const id = files.get().tabs[0].id
  files.edit(id, 'draft')
  action.mockReturnValueOnce(rename)
  const moving = files.rename('notes', 'renamed', 'identity')
  await vi.advanceTimersByTimeAsync(701)
  expect(action.mock.calls.map(([name]) => name)).toEqual(['read', 'rename'])
  expect(files.get().active).toBe(source)
  files.open(destination)
  files.load(files.get().tabs)
  expect(action.mock.calls.map(([name]) => name)).toEqual(['read', 'rename'])

  finish()
  await moving
  expect(createSession('/fixture').get().tabs[0]).toMatchObject({
    path: destination,
    text: 'draft',
  })
  expect(files.get()).toMatchObject({ active: destination, tabs: [{ id, path: destination }] })
  action.mockResolvedValueOnce({
    status: 'saved',
    version: 'after',
    identity: 'after-identity',
    bytes: 5,
  })
  await vi.advanceTimersByTimeAsync(701)
  expect(action).toHaveBeenLastCalledWith('save', {
    path: destination,
    secretText: 'draft',
    version: 'before',
  })
})

test.each([
  ['second-identity', 'third-identity'],
  ['unrelated-identity', 'unrelated-identity'],
])('renaming with listed identity %s sends %s after two own saves', async (listed, expected) => {
  useTestStorage()
  const path = 'note.md'
  action.mockResolvedValueOnce({
    path,
    secretText: 'first',
    version: 'v1',
    identity: 'first-identity',
    bytes: 5,
  })
  const files = createSession('/fixture')
  files.open(path)
  files.load(files.get().tabs)
  await vi.advanceTimersByTimeAsync(0)
  const id = files.get().tabs[0].id
  action.mockResolvedValueOnce({
    status: 'saved',
    version: 'v2',
    identity: 'second-identity',
    bytes: 6,
  })
  files.edit(id, 'second')
  await vi.advanceTimersByTimeAsync(700)
  action.mockResolvedValueOnce({
    status: 'saved',
    version: 'v3',
    identity: 'third-identity',
    bytes: 5,
  })
  files.edit(id, 'third')
  await vi.advanceTimersByTimeAsync(700)
  const destination = 'renamed.md'
  action.mockResolvedValueOnce({ path: destination })
  await files.rename(path, destination, listed)
  expect(action).toHaveBeenLastCalledWith('rename', { path, destination, identity: expected })
})
