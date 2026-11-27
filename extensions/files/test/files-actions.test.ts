import { chmod, mkdir, readFile, stat, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { JsonValue } from '@earendil-works/chord/json'
import { expect, it } from 'vitest'
import { actions, personActions, userActions } from '../server.ts'
import type { ActionContext } from '@runtime/server/actions.ts'
import { callTrace } from '@runtime/server/trace.ts'
import { temp } from '@runtime/test/helpers.ts'

it('lists, reads and manually saves project text, preserves mode, refuses stale content and redacts action bodies', async () => {
  const root = await temp('files-project-')
  await mkdir(join(root, 'docs'))
  const path = 'docs/notes.md'
  const file = join(root, path)
  const original = '# CANARY original body\n'
  const edited = '# CANARY edited body\n'
  const newer = '# CANARY external body\n'
  await writeFile(file, original)
  await chmod(file, 0o751)
  const resources = new Map<string, unknown>()
  const ctx = {
    host: {
      projectRoot: root,
      resource: (key: string, create: () => unknown) => {
        if (!resources.has(key)) resources.set(key, create())
        return resources.get(key)
      },
    },
    conversationId: 42,
    signal: new AbortController().signal,
  } as ActionContext
  const trace = callTrace(join(await temp('files-trace-'), 'trace.sqlite'))
  trace.open()
  const call = <K extends keyof typeof actions>(name: K, args: JsonValue) =>
    trace.run({ kind: 'action', caller: 'ui', callee: 'files', name: `files/${name}`, args }, () =>
      actions[name](args, ctx),
    ) as ReturnType<(typeof actions)[K]>
  try {
    expect(userActions).toEqual([
      'list',
      'read',
      'save',
      'search',
      'create',
      'upload',
      'duplicate',
      'rename',
    ])
    expect(personActions).toEqual(userActions)
    expect(await call('list', { path: '' })).toEqual({
      root,
      path: '',
      entries: [
        {
          name: 'docs',
          path: 'docs',
          kind: 'directory',
          identity: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      ],
      truncated: false,
    })
    expect((await call('list', { path: 'docs' })).entries).toEqual([
      { name: 'notes.md', path, kind: 'file', identity: expect.stringMatching(/^[a-f0-9]{64}$/) },
    ])
    const opened = await call('read', { path })
    expect(opened).toEqual({
      path,
      secretText: original,
      identity: expect.stringMatching(/^[a-f0-9]{64}$/),
      version: expect.stringMatching(/^[a-f0-9]{64}$/),
      bytes: Buffer.byteLength(original),
    })
    const saved = await call('save', { path, secretText: edited, version: opened.version })
    expect(saved).toEqual({
      status: 'saved',
      identity: expect.stringMatching(/^[a-f0-9]{64}$/),
      version: expect.stringMatching(/^[a-f0-9]{64}$/),
      bytes: Buffer.byteLength(edited),
    })
    expect(await readFile(file, 'utf8')).toBe(edited)
    expect((await stat(file)).mode & 0o777).toBe(0o751)
    const reread = await call('read', { path })
    expect(saved.status === 'saved' && saved.version).toBe(reread.version)
    expect(saved.status === 'saved' && saved.identity).toBe(reread.identity)
    expect(reread.identity).not.toBe(opened.identity)
    expect(reread.version).not.toBe(opened.version)
    await writeFile(file, newer)
    expect(await call('save', { path, secretText: edited, version: reread.version })).toEqual({
      status: 'conflict',
    })
    expect(await readFile(file, 'utf8')).toBe(newer)

    await expect(call('read', { path: 'missing.md' })).rejects.toThrow('Files could not access')
    await expect(
      call('save', { path, secretText: 'CANARY invalid body\u0000', version: reread.version }),
    ).rejects.toThrow('Files could not access')
    const secretBytes = Buffer.from('CANARY binary\u0000').toString('base64')
    expect(await call('upload', { path: 'binary.dat', secretBytes })).toEqual({
      path: 'binary.dat',
    })
    await expect(call('upload', { path: 'binary.dat', secretBytes })).rejects.toThrow(
      'Files could not make this change',
    )
    const rows = trace.reader.query()
    expect(rows.filter((row) => !row.ok).map((row) => row.name)).toEqual([
      'files/read',
      'files/save',
      'files/upload',
    ])
    expect(rows.find((row) => row.name === 'files/read' && row.ok)?.result).toContain(
      '"secretText":"[redacted]"',
    )
    for (const row of rows.filter((item) => item.name === 'files/save'))
      expect(row.args).toContain('"secretText":"[redacted]"')
    for (const row of rows.filter((item) => item.name === 'files/upload'))
      expect(row.args).toContain('"secretBytes":"[redacted]"')
    expect(JSON.stringify(rows)).not.toContain(secretBytes)
    expect(JSON.stringify(rows)).not.toContain('CANARY')
  } finally {
    trace.close()
  }
})

it('finds nested files and directories by case-insensitive name or relative path without listing denied entries', async () => {
  const projectRoot = await temp('files-search-')
  await mkdir(join(projectRoot, 'Docs', 'Notes'), { recursive: true })
  await mkdir(join(projectRoot, '.git'))
  await writeFile(join(projectRoot, 'Docs', 'Notes', 'Plan.md'), 'body')
  await writeFile(join(projectRoot, 'Docs', 'Notes', '.env'), 'denied')
  await writeFile(join(projectRoot, '.git', 'Plan.md'), 'hidden')
  await symlink(join(projectRoot, 'Docs'), join(projectRoot, 'LinkedDocs'))
  const ctx = { host: { projectRoot }, signal: new AbortController().signal } as ActionContext
  const identity = expect.stringMatching(/^[a-f0-9]{64}$/)
  const file = { name: 'Plan.md', path: 'Docs/Notes/Plan.md', kind: 'file', identity }
  expect(await actions.search({ query: 'pLAN.MD' }, ctx)).toEqual({
    entries: [file],
    truncated: false,
  })
  expect(await actions.search({ query: 'docs/notes' }, ctx)).toEqual({
    entries: [{ name: 'Notes', path: 'Docs/Notes', kind: 'directory', identity }, file],
    truncated: false,
  })
})
