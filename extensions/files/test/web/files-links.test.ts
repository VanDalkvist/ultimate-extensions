import { afterEach, expect, it, vi } from 'vitest'
import { fileLinkPath, fileMarkdownLink, fileRequests } from '../../links.ts'
import { createSession } from '../../session.ts'
import type { FileResult } from '../../types.ts'

const fake = vi.hoisted(() => ({
  action: vi.fn<(ref: { name: string }, args: unknown) => Promise<FileResult>>(),
}))
vi.mock('@/sdk/solid', () => ({
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
  fake.action.mockResolvedValue({
    path,
    secretText: '# Original',
    version: 'v1',
    identity: 'i1',
    bytes: 10,
  })
  files.open(path)
  files.load(files.get().tabs)
  await Promise.resolve()
  fake.action.mockClear()
  const original = files.get().tabs[0]
  // A paused draft must not be reread or saved by following a link.
  files.pause(original.id)
  files.edit(original.id, '# Local draft')
  files.open('other.md')

  const decoded = fileLinkPath('#files/docs/plan%20v2.md')
  expect(decoded).toBe(path)
  fileRequests.request(decoded!)
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

it('copies a Markdown link whose escaped label and encoded destination round-trip', () => {
  const path = 'project notes/[start] (100% #1)!.md'
  const link = fileMarkdownLink(path)
  expect(link).toBe(
    '[\\[start\\] (100% #1)\\!.md](#files/project%20notes/%5Bstart%5D%20%28100%25%20%231%29!.md)',
  )
  expect(fileLinkPath(link.slice(link.indexOf('](#files/') + 2, -1))).toBe(path)
})

it('leaves external and core conversation links untouched', () => {
  for (const href of ['https://example.com/file.md', '#conversation-123', '?conversation=123']) {
    expect(fileLinkPath(href)).toBeUndefined()
  }
  expect(fileLinkPath('#files/%')).toBeNull()
})
