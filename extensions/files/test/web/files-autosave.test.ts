import { afterEach, expect, it, vi } from 'vitest'
import { createSession } from '../../session.tsx'
import { dirty } from '../../buffers.tsx'
import type { FileResult, SaveResult } from '../../types.ts'

const fake = vi.hoisted(() => ({
  action: vi.fn<(ref: { name: string }, args: unknown) => Promise<FileResult | SaveResult>>(),
}))
vi.mock('@/sdk', () => ({
  actionRef: (extension: string, name: string) => ({ extension, name }),
  api: { action: fake.action },
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}))

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  fake.action.mockReset()
})

function storage() {
  const values = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  })
}

it('autosaves after typing pauses, serializes newer edits and stops on conflict', async () => {
  vi.useFakeTimers()
  storage()
  let finish: (result: SaveResult) => void = () => {
    throw new Error('Save did not start')
  }
  fake.action.mockImplementation((ref: { name: string }) => {
    if (ref.name === 'read')
      return Promise.resolve({ path: 'notes.md', secretText: 'A', version: 'v1', bytes: 1 })
    return new Promise<SaveResult>((resolve) => {
      finish = resolve
    })
  })
  const files = createSession('/project')
  files.open('notes.md')
  files.load(files.get().tabs)
  await vi.advanceTimersByTimeAsync(0)
  const id = files.get().tabs[0].id
  await vi.advanceTimersByTimeAsync(1000)
  expect(fake.action.mock.calls.filter(([ref]) => ref.name === 'save')).toHaveLength(0)

  files.edit(id, 'B')
  await vi.advanceTimersByTimeAsync(600)
  files.edit(id, 'B edited')
  await vi.advanceTimersByTimeAsync(699)
  expect(fake.action.mock.calls.filter(([ref]) => ref.name === 'save')).toHaveLength(0)
  await vi.advanceTimersByTimeAsync(1)
  expect(fake.action.mock.calls.filter(([ref]) => ref.name === 'save')).toHaveLength(1)
  expect(fake.action.mock.lastCall?.[1]).toMatchObject({ secretText: 'B edited', version: 'v1' })

  files.edit(id, 'C')
  await vi.advanceTimersByTimeAsync(1000)
  expect(fake.action.mock.calls.filter(([ref]) => ref.name === 'save')).toHaveLength(1)
  finish({ status: 'saved', version: 'v2', bytes: 8 })
  await vi.advanceTimersByTimeAsync(700)
  expect(fake.action.mock.calls.filter(([ref]) => ref.name === 'save')).toHaveLength(2)
  expect(fake.action.mock.lastCall?.[1]).toMatchObject({ secretText: 'C', version: 'v2' })
  finish({ status: 'conflict' })
  await vi.advanceTimersByTimeAsync(0)
  files.edit(id, 'D kept locally')
  await vi.advanceTimersByTimeAsync(5000)
  expect(fake.action.mock.calls.filter(([ref]) => ref.name === 'save')).toHaveLength(2)
  expect(files.get().tabs[0]).toMatchObject({
    text: 'D kept locally',
    conflict: true,
    saving: false,
  })
  expect(dirty(files.get().tabs[0])).toBe(true)
})

it('pauses autosave for discard confirmation and refuses to discard an in-flight write', async () => {
  vi.useFakeTimers()
  storage()
  let finish: (result: SaveResult) => void = () => {
    throw new Error('Save did not start')
  }
  fake.action.mockImplementation((ref: { name: string }) =>
    ref.name === 'read'
      ? Promise.resolve({ path: 'notes.md', secretText: 'A', version: 'v1', bytes: 1 })
      : new Promise<SaveResult>((resolve) => {
          finish = resolve
        }),
  )
  const files = createSession('/project')
  files.open('notes.md')
  files.load(files.get().tabs)
  await vi.advanceTimersByTimeAsync(0)
  const id = files.get().tabs[0].id
  files.edit(id, 'B')
  expect(files.pause(id)).toBe(true)
  await vi.advanceTimersByTimeAsync(2000)
  expect(fake.action.mock.calls.filter(([ref]) => ref.name === 'save')).toHaveLength(0)
  files.resume(id)
  await vi.advanceTimersByTimeAsync(700)
  expect(fake.action.mock.calls.filter(([ref]) => ref.name === 'save')).toHaveLength(1)
  expect(files.pause(id)).toBe(false)
  expect(files.close('notes.md')).toBe(false)
  expect(files.reload('notes.md')).toBe(false)
  expect(createSession('/project').get().tabs[0]).toMatchObject({ text: 'B', unconfirmed: true })
  finish({ status: 'saved', version: 'v2', bytes: 1 })
  await vi.advanceTimersByTimeAsync(0)
  files.edit(id, 'C discarded before saving')
  expect(files.pause(id)).toBe(true)
  expect(files.close('notes.md')).toBe(true)
  await vi.advanceTimersByTimeAsync(2000)
  expect(files.get().tabs).toHaveLength(0)
  expect(fake.action.mock.calls.filter(([ref]) => ref.name === 'save')).toHaveLength(1)
})

it('keeps errors and recovered drafts local until an explicit retry', async () => {
  vi.useFakeTimers()
  storage()
  fake.action.mockImplementation((ref: { name: string }) =>
    ref.name === 'read'
      ? Promise.resolve({ path: 'notes.md', secretText: 'A', version: 'v1', bytes: 1 })
      : Promise.reject(new Error('Connection lost')),
  )
  const files = createSession('/project')
  files.open('notes.md')
  files.load(files.get().tabs)
  await vi.advanceTimersByTimeAsync(0)
  const id = files.get().tabs[0].id
  files.edit(id, 'B')
  await vi.advanceTimersByTimeAsync(700)
  expect(files.get().tabs[0]).toMatchObject({
    text: 'B',
    error: 'Connection lost',
    unconfirmed: true,
  })
  files.edit(id, 'C')
  await vi.advanceTimersByTimeAsync(5000)
  expect(fake.action.mock.calls.filter(([ref]) => ref.name === 'save')).toHaveLength(1)

  const recovered = createSession('/project')
  await vi.advanceTimersByTimeAsync(5000)
  expect(fake.action.mock.calls.filter(([ref]) => ref.name === 'save')).toHaveLength(1)
  expect(recovered.get().tabs[0]).toMatchObject({ text: 'C', restored: true, unconfirmed: true })
  fake.action.mockResolvedValue({ status: 'saved', version: 'v2', bytes: 1 })
  recovered.retry(recovered.get().tabs[0].id)
  await vi.advanceTimersByTimeAsync(0)
  expect(fake.action.mock.calls.filter(([ref]) => ref.name === 'save')).toHaveLength(2)
  expect(dirty(recovered.get().tabs[0])).toBe(false)
})
