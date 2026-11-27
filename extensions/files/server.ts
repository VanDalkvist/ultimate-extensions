import type { JsonValue } from '@earendil-works/chord/json'
import { defineExtension } from '@earendil-works/pi-durable'
import {
  createPath,
  duplicateFile,
  FilesSourceChanged,
  listDirectory,
  readText,
  renamePath,
  saveText,
  searchPaths,
  uploadBytes,
  validatePath,
} from './files.ts'
import type { DirectoryResult, FileResult, SaveResult, SearchResult } from './types.ts'

export default defineExtension({ name: 'files' })

export const userActions = [
  'list',
  'read',
  'save',
  'search',
  'create',
  'upload',
  'duplicate',
  'rename',
]
export const personActions = userActions

type MutationQueue = { pending: number; tail: Promise<void> }
const MAX_PENDING_MUTATIONS = 4

type FilesContext = {
  host: {
    projectRoot: string
    resource<T>(key: string, create: () => T): T
  }
  signal: AbortSignal
}

function input(args: JsonValue, ...keys: string[]) {
  if (
    !args ||
    typeof args !== 'object' ||
    Array.isArray(args) ||
    Object.keys(args).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(args, key))
  )
    throw new Error(`Expected { ${keys.join(', ')} }`)
  return args
}

async function access<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch {
    // Filesystem errors can include paths or other untrusted data; keep notices and trace errors content-free.
    throw new Error(
      'Files could not access this path. Check the project path, permissions, and file limits.',
    )
  }
}

async function mutate<T>(
  { host, signal }: FilesContext,
  work: (root: string) => Promise<T>,
): Promise<T> {
  const queue = host.resource<MutationQueue>('files.mutations', () => ({
    pending: 0,
    tail: Promise.resolve(),
  }))
  if (queue.pending >= MAX_PENDING_MUTATIONS)
    throw new Error('Files is busy. Try again after the current changes finish.')
  queue.pending++
  const operation = queue.tail.then(() => {
    if (signal.aborted) throw new Error('Files change was canceled.')
    return work(host.projectRoot).catch((error: unknown) => {
      if (error instanceof FilesSourceChanged) throw error
      throw new Error(
        'Files could not make this change. Check that the paths are allowed, the destination is unused, and the operation is supported.',
      )
    })
  })
  queue.tail = operation.then(settled, settled)
  try {
    return await operation
  } finally {
    queue.pending--
  }
}

function settled() {}

function transferPaths(args: JsonValue) {
  const { path, destination } = input(args, 'path', 'destination')
  validatePath(path)
  validatePath(destination)
  return { path, destination }
}

export const actions = {
  async list(args: JsonValue, { host }: FilesContext): Promise<DirectoryResult> {
    const { path } = input(args, 'path')
    validatePath(path, true)
    return access(() => listDirectory(host.projectRoot, path))
  },
  async read(args: JsonValue, { host }: FilesContext): Promise<FileResult> {
    const { path } = input(args, 'path')
    validatePath(path)
    return access(() => readText(host.projectRoot, path))
  },
  async save(args: JsonValue, ctx: FilesContext): Promise<SaveResult> {
    const { path, secretText, version } = input(args, 'path', 'secretText', 'version')
    validatePath(path)
    if (
      typeof secretText !== 'string' ||
      typeof version !== 'string' ||
      !/^[a-f0-9]{64}$/.test(version)
    )
      throw new Error('Expected text and a SHA256 version from Files read')
    return access(() => mutate(ctx, (root) => saveText(root, path, secretText, version)))
  },
  async search(args: JsonValue, { host, signal }: FilesContext): Promise<SearchResult> {
    const { query } = input(args, 'query')
    if (typeof query !== 'string' || query.length > 4096)
      throw new Error('Expected a search query within the length limit')
    return access(() => searchPaths(host.projectRoot, query, signal))
  },
  async create(args: JsonValue, ctx: FilesContext) {
    const { path, kind } = input(args, 'path', 'kind')
    validatePath(path)
    if (kind !== 'file' && kind !== 'directory') throw new Error('Expected file or directory')
    return mutate(ctx, (root) => createPath(root, path, kind))
  },
  async upload(args: JsonValue, ctx: FilesContext) {
    const { path, secretBytes } = input(args, 'path', 'secretBytes')
    validatePath(path)
    if (typeof secretBytes !== 'string') throw new Error('Expected a base64 upload')
    return mutate(ctx, (root) => uploadBytes(root, path, secretBytes))
  },
  async duplicate(args: JsonValue, ctx: FilesContext) {
    const { path, destination } = transferPaths(args)
    return mutate(ctx, (root) => duplicateFile(root, path, destination))
  },
  async rename(args: JsonValue, ctx: FilesContext) {
    const { path, destination, identity } = input(args, 'path', 'destination', 'identity')
    validatePath(path)
    validatePath(destination)
    if (typeof identity !== 'string' || !/^[a-f0-9]{64}$/.test(identity))
      throw new Error('Expected a source identity from Files')
    return mutate(ctx, (root) => renamePath(root, path, destination, identity))
  },
}
