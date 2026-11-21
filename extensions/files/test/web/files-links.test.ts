import type { MouseEvent, ReactElement } from 'react'
import { createElement } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { FileLink, fileRequests } from '../../links.tsx'
import { createSession } from '../../session.tsx'
import type { FileResult } from '../../types.ts'

const fake = vi.hoisted(() => ({
  showSurface: vi.fn<(id: string) => void>(),
  action: vi.fn<(ref: { name: string }, args: unknown) => Promise<FileResult>>(),
}))
vi.mock('@/sdk', () => ({
  useUltimate: () => ({ showSurface: fake.showSurface }),
  actionRef: (extension: string, name: string) => ({ extension, name }),
  api: { action: fake.action },
  errorMessage: (error: unknown) => String(error),
}))

afterEach(() => {
  const pending = fileRequests.get()
  if (pending) fileRequests.consume(pending)
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

it('requests Files before it mounts, then opens the requested tab without replacing its draft', async () => {
  const storage = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  })
  const files = createSession('/host-project')
  const path = 'docs/plan v2.md'
  fake.action.mockResolvedValue({ path, secretText: '# Original', version: 'v1', bytes: 10 })
  files.open(path)
  files.load(files.get().tabs)
  await Promise.resolve()
  fake.action.mockClear()
  const original = files.get().tabs[0]
  // A paused draft must not be reread or saved by following a link.
  files.pause(original.id)
  files.edit(original.id, '# Local draft')
  files.open('other.md')

  const link = FileLink({
    href: '#files/docs/plan%20v2.md',
    children: 'Plan',
    core: 'external link',
  }) as ReactElement<{ onClick(event: MouseEvent): void }>
  const preventDefault = vi.fn<() => void>()
  link.props.onClick({ preventDefault } as unknown as MouseEvent)
  expect(preventDefault).toHaveBeenCalledOnce()
  expect(fake.showSurface).toHaveBeenCalledWith('files')
  const request = fileRequests.get()!
  expect(request).toEqual({ path })

  // The mounted workspace uses this same session.open, after list supplies the host root.
  files.open(request.path)
  fileRequests.consume(request)
  expect(fileRequests.get()).toBeNull()
  expect(files.get().active).toBe(path)
  expect(files.get().tabs).toHaveLength(2)
  expect(files.get().tabs[0]).toMatchObject({ id: original.id, text: '# Local draft' })
  expect(fake.action).not.toHaveBeenCalled()
})

it('leaves external and core conversation links untouched', () => {
  for (const href of ['https://example.com/file.md', '#conversation-123', '?conversation=123']) {
    const core = createElement('a', { href }, 'Original link')
    expect(FileLink({ href, children: 'Link', core })).toBe(core)
  }
  expect(fake.showSurface).not.toHaveBeenCalled()
  expect(fileRequests.get()).toBeNull()
})
