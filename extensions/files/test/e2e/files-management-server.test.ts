import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { actions } from '../../server.ts'

function context(projectRoot: string) {
  const resources = new Map<string, unknown>()
  return {
    host: {
      projectRoot,
      resource: <T>(key: string, create: () => T) => {
        if (!resources.has(key)) resources.set(key, create())
        return resources.get(key) as T
      },
    },
    signal: new AbortController().signal,
  }
}

async function temp(prefix: string) {
  const root = await mkdtemp(join(tmpdir(), prefix))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  return root
}

async function identify(ctx: ReturnType<typeof context>, path: string) {
  const parent = dirname(path)
  const { entries } = await actions.list({ path: parent === '.' ? '' : parent }, ctx)
  const identity = entries.find((entry) => entry.path === path)?.identity
  if (!identity) throw new Error('Expected an available Files entry')
  return identity
}

it('creates, edits, uploads, duplicates and renames without changing file bytes', async () => {
  const root = await temp('files-management-')
  const ctx = context(root)
  expect(await actions.create({ path: 'Docs', kind: 'directory' }, ctx)).toEqual({ path: 'Docs' })
  const path = 'Docs/text.md'
  expect(await actions.create({ path, kind: 'file' }, ctx)).toEqual({ path })
  const { version } = await actions.read({ path }, ctx)
  expect(await actions.save({ path, version, secretText: 'new content' }, ctx)).toMatchObject({
    status: 'saved',
  })
  expect(await readFile(join(root, path), 'utf8')).toBe('new content')

  const bytes = Buffer.from([255, 0, 3, 1, 254])
  expect(
    await actions.upload({ path: 'binary', secretBytes: bytes.toString('base64') }, ctx),
  ).toEqual({ path: 'binary' })
  expect(await actions.duplicate({ path: 'binary', destination: 'Docs/copy' }, ctx)).toEqual({
    path: 'Docs/copy',
  })
  const copy = await identify(ctx, 'Docs/copy')
  const docs = await identify(ctx, 'Docs')
  expect(
    await actions.rename({ path: 'Docs/copy', destination: 'Docs/copied', identity: copy }, ctx),
  ).toEqual({
    path: 'Docs/copied',
  })
  expect(await actions.rename({ path: 'Docs', destination: 'Notes', identity: docs }, ctx)).toEqual(
    {
      path: 'Notes',
    },
  )
  expect(await identify(ctx, 'Notes/copied')).toBe(copy)
  expect(await identify(ctx, 'Notes')).toBe(docs)
  expect(await readFile(join(root, 'Notes/copied'))).toEqual(bytes)
  expect(await readFile(join(root, 'binary'))).toEqual(bytes)
  expect(new Set(await readdir(join(root, 'Notes')))).toEqual(new Set(['copied', 'text.md']))
  expect(new Set(await readdir(root))).toEqual(new Set(['Notes', 'binary']))
})

it('does not clobber a file or an empty directory when renames race across action queues', async () => {
  const root = await temp('files-rename-race-')
  await writeFile(join(root, 'left'), 'first source')
  await writeFile(join(root, 'right'), 'second source')
  await mkdir(join(root, 'left-dir'))
  await mkdir(join(root, 'right-dir'))
  for (const [left, right, destination] of [
    ['left', 'right', 'winner'],
    ['left-dir', 'right-dir', 'winner-dir'],
  ]) {
    const before = await Promise.all([stat(join(root, left)), stat(join(root, right))])
    const leftCtx = context(root)
    const rightCtx = context(root)
    const [leftId, rightId] = await Promise.all([
      identify(leftCtx, left),
      identify(rightCtx, right),
    ])
    const results = await Promise.allSettled([
      actions.rename({ path: left, destination, identity: leftId }, leftCtx),
      actions.rename({ path: right, destination, identity: rightId }, rightCtx),
    ])
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
    const firstWon = results[0].status === 'fulfilled'
    const [winner, loser] = firstWon ? [left, right] : [right, left]
    expect(await readdir(root)).not.toContain(winner)
    expect((await stat(join(root, destination))).ino).toBe(before[firstWon ? 0 : 1].ino)
    expect((await stat(join(root, loser))).ino).toBe(before[firstWon ? 1 : 0].ino)
  }
})

it('rejects a stale save to a replacement with identical bytes, but keeps the draft valid through a rename', async () => {
  const root = await temp('files-save-identity-')
  const first = context(root)
  const second = context(root)
  const path = 'draft.md'
  const destination = 'moved.md'
  await writeFile(join(root, path), 'original')
  const { version } = await actions.read({ path }, first)
  const identity = await identify(second, path)
  await actions.rename({ path, destination, identity }, second)
  await actions.upload({ path, secretBytes: Buffer.from('original').toString('base64') }, second)

  expect(await actions.save({ path, version, secretText: 'draft' }, first)).toEqual({
    status: 'conflict',
  })
  expect(await readFile(join(root, path), 'utf8')).toBe('original')
  expect((await actions.read({ path: destination }, first)).version).toBe(version)
  const result = await actions.save({ path: destination, version, secretText: 'draft' }, first)
  expect(result).toMatchObject({
    status: 'saved',
    version: expect.stringMatching(/^[a-f0-9]{64}$/),
  })
  const saved = await actions.read({ path: destination }, second)
  expect(result).toMatchObject({ version: saved.version, identity: saved.identity })
  expect(saved.identity).toBe(await identify(second, destination))
  expect(saved.identity).not.toBe(identity)
  expect(saved.version).not.toBe(version)
  expect(saved.secretText).toBe('draft')
  const sameBytes = await actions.save(
    { path: destination, version: saved.version, secretText: saved.secretText },
    second,
  )
  expect(sameBytes).toMatchObject({ status: 'saved' })
  expect(sameBytes).not.toMatchObject({ version: saved.version })
})

it('rejects renaming a replacement after another Files action moved the selected source', async () => {
  const root = await temp('files-stale-rename-')
  const first = context(root)
  const second = context(root)
  const path = 'folder'
  await actions.create({ path, kind: 'directory' }, first)
  const identity = await identify(first, path)
  await actions.rename({ path, destination: 'first-move', identity }, second)
  await actions.create({ path, kind: 'directory' }, second)
  const replacement = await identify(second, path)
  expect(replacement).not.toBe(identity)

  await expect(
    actions.rename({ path, destination: 'stale-move', identity }, first),
  ).rejects.toThrow('Files source changed. Refresh and try again.')
  expect(await identify(first, path)).toBe(replacement)
  expect(await identify(first, 'first-move')).toBe(identity)
  expect(await readdir(root)).not.toContain('stale-move')
})
