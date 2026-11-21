import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { JsonValue } from '@earendil-works/chord/json'
import { expect, it } from 'vitest'
import { actions, userActions } from '../server.ts'
import type { ActionContext } from '/home/ubuntu/Projects/ultimate/server/actions.ts'
import { callTrace } from '/home/ubuntu/Projects/ultimate/server/trace.ts'
import { temp } from '/home/ubuntu/Projects/ultimate/test/helpers.ts'

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
    expect(userActions).toEqual(['list', 'read', 'save'])
    expect(await call('list', { path: '' })).toEqual({
      root,
      path: '',
      entries: [{ name: 'docs', path: 'docs', kind: 'directory' }],
      truncated: false,
    })
    expect((await call('list', { path: 'docs' })).entries).toEqual([
      { name: 'notes.md', path, kind: 'file' },
    ])
    const opened = await call('read', { path })
    expect(opened).toEqual({
      path,
      secretText: original,
      version: expect.stringMatching(/^[a-f0-9]{64}$/),
      bytes: Buffer.byteLength(original),
    })
    const saved = await call('save', { path, secretText: edited, version: opened.version })
    expect(saved).toEqual({
      status: 'saved',
      version: expect.stringMatching(/^[a-f0-9]{64}$/),
      bytes: Buffer.byteLength(edited),
    })
    expect(await readFile(file, 'utf8')).toBe(edited)
    expect((await stat(file)).mode & 0o777).toBe(0o751)
    const reread = await call('read', { path })
    expect(saved.status === 'saved' && saved.version).toBe(reread.version)
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
    const rows = trace.reader.query()
    expect(rows.filter((row) => !row.ok).map((row) => row.name)).toEqual([
      'files/read',
      'files/save',
    ])
    expect(rows.find((row) => row.name === 'files/read' && row.ok)?.result).toContain(
      '"secretText":"[redacted]"',
    )
    for (const row of rows.filter((item) => item.name === 'files/save'))
      expect(row.args).toContain('"secretText":"[redacted]"')
    expect(JSON.stringify(rows)).not.toContain('CANARY')
  } finally {
    trace.close()
  }
})
