import type { JsonValue } from '@earendil-works/chord/json'
import { defineExtension } from '@earendil-works/pi-durable'
import { canonicalPath, listDirectory, readText, saveText, validatePath } from './files.ts'
import type { DirectoryResult, FileResult, SaveResult } from './types.ts'

export default defineExtension({ name: 'files' })

export const userActions = ['list', 'read', 'save']

type FilesContext = {
  host: {
    projectRoot: string
    resource<T>(key: string, create: () => T): T
  }
}

function input(args: JsonValue, save = false, rootAllowed = false) {
  const keys = save ? ['path', 'secretText', 'version'] : ['path']
  if (
    !args ||
    typeof args !== 'object' ||
    Array.isArray(args) ||
    Object.keys(args).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(args, key))
  )
    throw new Error(save ? 'Expected { path, secretText, version }' : 'Expected { path }')
  validatePath(args.path, rootAllowed)
  return { path: args.path, secretText: args.secretText, version: args.version }
}

async function access<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch {
    // Filesystem errors can include paths or other untrusted data; keep notices and trace errors content-free.
    throw new Error(
      'Files could not access this path. It must be an existing, allowed UTF-8 text file or directory within the project limits.',
    )
  }
}

export const actions = {
  async list(args: JsonValue, { host }: FilesContext): Promise<DirectoryResult> {
    const { path } = input(args, false, true)
    return access(() => listDirectory(host.projectRoot, path))
  },
  async read(args: JsonValue, { host }: FilesContext): Promise<FileResult> {
    const { path } = input(args)
    return access(() => readText(host.projectRoot, path))
  },
  async save(args: JsonValue, { host }: FilesContext): Promise<SaveResult> {
    const values = input(args, true)
    const { path, secretText, version } = values
    if (
      typeof secretText !== 'string' ||
      typeof version !== 'string' ||
      !/^[a-f0-9]{64}$/.test(version)
    )
      throw new Error('Expected text and a SHA256 version from Files read')
    return access(async () => {
      const canonical = await canonicalPath(host.projectRoot, path)
      const saves = host.resource('files.saves', () => new Map<string, Promise<SaveResult>>())
      const write = () => saveText(host.projectRoot, path, secretText, version)
      const operation = (saves.get(canonical) ?? Promise.resolve()).then(write, write)
      saves.set(canonical, operation)
      try {
        return await operation
      } finally {
        if (saves.get(canonical) === operation) saves.delete(canonical)
      }
    })
  },
}
