import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { type BigIntStats, constants } from 'node:fs'
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  opendir,
  realpath,
  rename,
  rm,
  rmdir,
} from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'
import { promisify } from 'node:util'
import type { DirectoryResult, FileResult, FilesEntry, SaveResult, SearchResult } from './types.ts'

const MAX_BYTES = 512 * 1024
const MAX_ENTRIES = 1000
const MAX_SEARCH_SCAN = 5000
const MAX_SEARCH_RESULTS = 200
const SEARCH_MS = 750
const privateTemporary = /^(?:\.files-[0-9a-f-]{36}\.tmp|\.files-stage-[a-z0-9]{6})$/i
const run = promisify(execFile)
const hidden = new Set(['.git', 'node_modules'])
const credentials = new Set([
  '.ssh',
  '.aws',
  '.gnupg',
  '.kube',
  '.docker',
  '.npmrc',
  '.netrc',
  '.pypirc',
  '.git-credentials',
  '.envrc',
  '.direnv',
  '.htpasswd',
  'auth.json',
  'secrets.json',
])

export function validatePath(value: unknown, rootAllowed = false): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length > 4096 ||
    /[\\:\p{Cc}]/u.test(value) ||
    (value === ''
      ? !rootAllowed
      : value.split('/').some((part) => !part || part === '.' || part === '..'))
  )
    throw new Error('Expected a relative slash-separated project path')
}

function blocked(path: string): string | undefined {
  for (const part of path.split('/')) {
    const name = part.toLowerCase()
    if (hidden.has(name) || privateTemporary.test(name)) return 'Hidden project path'
    if (
      credentials.has(name) ||
      (/^\.env(?:$|[.-])/.test(name) && !['.env.example', '.env.sample'].includes(name)) ||
      /^(?:credentials|secrets)(?:\.|$)/.test(name) ||
      /^id_(?:rsa|dsa|ecdsa|ed25519)(?:[._-]|$)/.test(name) ||
      /^private[-_]?key(?:[._-]|$)/.test(name) ||
      /\.(?:pem|key|p12|pfx|keystore|jks)$/.test(name)
    )
      return 'Credential path is not available in Files'
  }
  return undefined
}

function inside(root: string, target: string) {
  const path = relative(root, target)
  if (isAbsolute(path) || path === '..' || path.startsWith('..' + sep))
    throw new Error('Path is outside the project')
}

/** Resolve from the host root, rejecting symlinks at every relative component. */
async function locate(projectRoot: string, path: string) {
  const reason = blocked(path)
  if (reason) throw new Error(reason)
  const root = await realpath(projectRoot)
  let target = root
  for (const part of path.split('/').filter(Boolean)) {
    target = join(target, part)
    if ((await lstat(target)).isSymbolicLink())
      throw new Error('Symlinks are not available in Files')
    inside(root, await realpath(target))
  }
  return { root, target }
}

function textBytes(secretText: string) {
  if (Buffer.byteLength(secretText, 'utf8') > MAX_BYTES)
    throw new Error('Text exceeds the 512 KiB limit')
  const bytes = Buffer.from(secretText, 'utf8')
  if (bytes.toString('utf8') !== secretText || /(?![\t\n\r])\p{Cc}/u.test(secretText))
    throw new Error('Only valid UTF-8 text without binary controls is supported')
  return bytes
}

const identityOf = (stat: BigIntStats) =>
  createHash('sha256').update(`${stat.dev}:${stat.ino}:${stat.birthtimeNs}`).digest('hex')

const versionOf = (identity: string, bytes: Buffer) =>
  createHash('sha256').update(identity).update(bytes).digest('hex')

async function readBytes(projectRoot: string, path: string) {
  const { target } = await locate(projectRoot, path)
  const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = await file.stat({ bigint: true })
    if (!stat.isFile() || stat.nlink !== 1n)
      throw new Error('Only regular, non-hardlinked files are supported')
    if (stat.size > MAX_BYTES) throw new Error('File exceeds the 512 KiB limit')
    const checked = await locate(projectRoot, path)
    const linked = await lstat(checked.target, { bigint: true })
    if (
      linked.dev !== stat.dev ||
      linked.ino !== stat.ino ||
      linked.birthtimeNs !== stat.birthtimeNs ||
      checked.target !== target
    )
      throw new Error('File changed while opening')
    const buffer = Buffer.alloc(MAX_BYTES + 1)
    let length = 0
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null)
      if (!bytesRead) break
      length += bytesRead
    }
    if (length > MAX_BYTES) throw new Error('File exceeds the 512 KiB limit')
    return { target, stat, bytes: buffer.subarray(0, length) }
  } finally {
    await file.close()
  }
}

async function snapshot(projectRoot: string, path: string) {
  const { target, stat, bytes } = await readBytes(projectRoot, path)
  const secretText = bytes.toString('utf8')
  if (!textBytes(secretText).equals(bytes)) throw new Error('Only valid UTF-8 text is supported')
  const identity = identityOf(stat)
  return {
    target,
    stat,
    secretText,
    identity,
    version: versionOf(identity, bytes),
    bytes: bytes.length,
  }
}

export async function listDirectory(projectRoot: string, path: string): Promise<DirectoryResult> {
  const { root, target } = await locate(projectRoot, path)
  const directory = await opendir(target)
  const entries: FilesEntry[] = []
  let scanned = 0
  let truncated = false
  for await (const entry of directory) {
    if (scanned++ === MAX_ENTRIES) {
      truncated = true
      break
    }
    if (hidden.has(entry.name.toLowerCase()) || privateTemporary.test(entry.name)) continue
    const child = path ? `${path}/${entry.name}` : entry.name
    let reason = blocked(child)
    if (!reason) {
      try {
        validatePath(child)
        await locate(projectRoot, child)
        const stat = await lstat(join(target, entry.name), { bigint: true })
        const details = availableEntry(stat)
        if (details) {
          entries.push({ name: entry.name, path: child, ...details })
          continue
        }
        reason = 'Only regular, non-hardlinked files are supported'
      } catch {
        // An inaccessible, invalid, linked or concurrently removed entry is displayed without exposing its target.
        reason = 'Entry is not available in Files'
      }
    }
    entries.push({ name: entry.name, path: child, kind: 'blocked', reason })
  }
  entries.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
  return { root, path, entries, truncated }
}

export async function readText(projectRoot: string, path: string): Promise<FileResult> {
  const { secretText, identity, version, bytes } = await snapshot(projectRoot, path)
  return { path, secretText, identity, version, bytes }
}

/** Own saves are serialized by the action; external changes can still race the final check and rename. */
export async function saveText(
  projectRoot: string,
  path: string,
  secretText: string,
  version: string,
): Promise<SaveResult> {
  const bytes = textBytes(secretText)
  const current = await snapshot(projectRoot, path)
  if (current.version !== version) return { status: 'conflict' }
  const temporary = join(dirname(current.target), `.files-${randomUUID()}.tmp`)
  try {
    const file = await open(temporary, 'wx', 0o600)
    let identity: string
    try {
      await file.writeFile(bytes)
      await file.chmod(Number(current.stat.mode & 0o7777n))
      await file.sync()
      identity = identityOf(await file.stat({ bigint: true }))
    } finally {
      await file.close()
    }
    // Do not use writeTextAtomically: it follows symlinks and creates missing paths (#3271).
    // Re-read after preparing the temporary file; deletion must fail, never create a replacement from a stale read.
    const latest = await snapshot(projectRoot, path)
    if (
      latest.version !== version ||
      latest.target !== current.target ||
      latest.stat.mode !== current.stat.mode
    )
      return { status: 'conflict' }
    await rename(temporary, current.target)
    return { status: 'saved', identity, version: versionOf(identity, bytes), bytes: bytes.length }
  } finally {
    await rm(temporary, { force: true })
  }
}

export async function searchPaths(
  projectRoot: string,
  query: string,
  signal: AbortSignal,
): Promise<SearchResult> {
  const entries: FilesEntry[] = []
  signal.throwIfAborted()
  const needle = query.trim().toLowerCase()
  if (!needle) return { entries, truncated: false }
  const deadline = performance.now() + SEARCH_MS
  const pending = ['']
  let scanned = 0
  let truncated = false
  const expired = () => {
    signal.throwIfAborted()
    return performance.now() >= deadline
  }
  scan: for (const path of pending) {
    if (expired()) {
      truncated = true
      break
    }
    let directory: Awaited<ReturnType<typeof opendir>>
    try {
      directory = await opendir((await locate(projectRoot, path)).target)
    } catch (error) {
      if (!path) throw error
      continue
    }
    for await (const dirent of directory) {
      if (expired() || scanned++ >= MAX_SEARCH_SCAN) {
        truncated = true
        break scan
      }
      if (!dirent.isDirectory() && !dirent.isFile()) continue
      const child = path ? `${path}/${dirent.name}` : dirent.name
      if (blocked(child)) continue
      const matches = child.toLowerCase().includes(needle)
      if (!matches && !dirent.isDirectory()) continue
      const details = await searchEntry(projectRoot, child)
      if (expired()) {
        truncated = true
        break scan
      }
      if (!details) continue
      if (details.kind === 'directory') pending.push(child)
      if (!matches) continue
      if (entries.length === MAX_SEARCH_RESULTS) {
        truncated = true
        break scan
      }
      entries.push({ name: dirent.name, path: child, ...details })
    }
  }
  signal.throwIfAborted()
  entries.sort((a, b) => a.path.localeCompare(b.path))
  return { entries, truncated }
}

function availableEntry(stat: BigIntStats) {
  if (stat.isDirectory()) return { kind: 'directory' as const, identity: identityOf(stat) }
  if (stat.isFile() && stat.nlink === 1n)
    return { kind: 'file' as const, identity: identityOf(stat) }
  return undefined
}

async function searchEntry(projectRoot: string, path: string) {
  try {
    validatePath(path)
    return availableEntry(await lstat((await locate(projectRoot, path)).target, { bigint: true }))
  } catch {
    return undefined
  }
}

async function destinationAt(projectRoot: string, path: string) {
  if (blocked(path)) throw new Error('Destination is not available in Files')
  const parent = dirname(path)
  const { target } = await locate(projectRoot, parent === '.' ? '' : parent)
  return { parent: target, target: join(target, basename(path)) }
}

async function publishBytes(projectRoot: string, path: string, bytes: Buffer) {
  const { parent, target } = await destinationAt(projectRoot, path)
  const stage = await mkdtemp(join(parent, '.files-stage-'))
  const temporary = join(stage, 'upload')
  try {
    const file = await open(temporary, 'wx', 0o600)
    try {
      await file.writeFile(bytes)
    } finally {
      await file.close()
    }
    if ((await destinationAt(projectRoot, path)).parent !== parent)
      throw new Error('Destination directory changed')
    await link(temporary, target)
  } finally {
    await rm(temporary, { force: true })
    await rmdir(stage)
  }
}

export async function createPath(projectRoot: string, path: string, kind: 'file' | 'directory') {
  const { target } = await destinationAt(projectRoot, path)
  if (kind === 'directory') await mkdir(target)
  else await (await open(target, 'wx', 0o600)).close()
  return { path }
}

export async function uploadBytes(projectRoot: string, path: string, secretBytes: string) {
  if (secretBytes.length > Math.ceil(MAX_BYTES / 3) * 4)
    throw new Error('Upload exceeds the 512 KiB limit')
  const bytes = Buffer.from(secretBytes, 'base64')
  if (bytes.length > MAX_BYTES || bytes.toString('base64') !== secretBytes)
    throw new Error('Expected canonical base64 within the upload limit')
  await publishBytes(projectRoot, path, bytes)
  return { path }
}

export async function duplicateFile(projectRoot: string, path: string, destination: string) {
  const { bytes } = await readBytes(projectRoot, path)
  await publishBytes(projectRoot, destination, bytes)
  return { path: destination }
}

/** Use the kernel primitive directly: GNU mv may emulate no-replace with a racy check on unsupported filesystems. */
const renameNoReplace = `
import ctypes, os, stat, sys
parent, source, destination = map(os.fsencode, sys.argv[1:4])
expected = tuple(map(int, sys.argv[4:6]))
fd = os.open(parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
renameat2 = ctypes.CDLL(None, use_errno=True).renameat2
renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
try:
    entry = os.stat(source, dir_fd=fd, follow_symlinks=False)
except FileNotFoundError:
    sys.exit(10)
if (entry.st_dev, entry.st_ino) != expected:
    sys.exit(10)
if not (stat.S_ISDIR(entry.st_mode) or (stat.S_ISREG(entry.st_mode) and entry.st_nlink == 1)):
    sys.exit(1)
RENAME_NOREPLACE = 1
if renameat2(fd, source, fd, destination, RENAME_NOREPLACE) != 0:
    sys.exit(1)
`

export class FilesSourceChanged extends Error {
  constructor() {
    super('Files source changed. Refresh and try again.')
  }
}

async function renameSource(projectRoot: string, path: string) {
  try {
    const { target } = await locate(projectRoot, path)
    return { target, stat: await lstat(target, { bigint: true }) }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      throw new FilesSourceChanged()
    throw error
  }
}

export async function renamePath(
  projectRoot: string,
  path: string,
  destination: string,
  identity: string,
) {
  if (
    dirname(path) !== dirname(destination) ||
    path === destination ||
    process.platform !== 'linux'
  )
    throw new Error('Atomic rename is unavailable for this path or platform')
  const { parent } = await destinationAt(projectRoot, destination)
  const { target, stat } = await renameSource(projectRoot, path)
  const details = availableEntry(stat)
  if (dirname(target) !== parent) throw new Error('Source is not available in Files')
  if (details?.identity !== identity) throw new FilesSourceChanged()
  try {
    await run(
      '/usr/bin/python3',
      [
        '-I',
        '-S',
        '-c',
        renameNoReplace,
        parent,
        basename(path),
        basename(destination),
        String(stat.dev),
        String(stat.ino),
      ],
      { timeout: 2000, maxBuffer: 4096 },
    )
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 10)
      throw new FilesSourceChanged()
    throw error
  }
  return { path: destination }
}
