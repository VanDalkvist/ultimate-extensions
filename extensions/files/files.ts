import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, opendir, realpath, rename, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import type { DirectoryResult, FileResult, FilesEntry, SaveResult } from './types.ts'

const MAX_BYTES = 512 * 1024
const MAX_ENTRIES = 1000
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
    if (hidden.has(name)) return 'Hidden project directory'
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

const versionOf = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

async function snapshot(projectRoot: string, path: string) {
  const { target } = await locate(projectRoot, path)
  const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.nlink !== 1)
      throw new Error('Only regular, non-hardlinked files are supported')
    if (stat.size > MAX_BYTES) throw new Error('Text exceeds the 512 KiB limit')
    const checked = await locate(projectRoot, path)
    const linked = await lstat(checked.target)
    if (linked.dev !== stat.dev || linked.ino !== stat.ino || checked.target !== target)
      throw new Error('File changed while opening')
    const buffer = Buffer.alloc(MAX_BYTES + 1)
    let length = 0
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null)
      if (!bytesRead) break
      length += bytesRead
    }
    const bytes = buffer.subarray(0, length)
    const secretText = bytes.toString('utf8')
    if (!textBytes(secretText).equals(bytes)) throw new Error('Only valid UTF-8 text is supported')
    return { target, stat, secretText, version: versionOf(bytes), bytes: bytes.length }
  } finally {
    await file.close()
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
    if (hidden.has(entry.name.toLowerCase())) continue
    const child = path ? `${path}/${entry.name}` : entry.name
    let reason = blocked(child)
    if (!reason) {
      try {
        validatePath(child)
        await locate(projectRoot, child)
        const stat = await lstat(join(target, entry.name))
        if (stat.isDirectory()) {
          entries.push({ name: entry.name, path: child, kind: 'directory' })
          continue
        }
        if (stat.isFile() && stat.nlink === 1) {
          entries.push({ name: entry.name, path: child, kind: 'file' })
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
  const { secretText, version, bytes } = await snapshot(projectRoot, path)
  return { path, secretText, version, bytes }
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
    try {
      await file.writeFile(bytes)
      await file.chmod(current.stat.mode & 0o7777)
      await file.sync()
    } finally {
      await file.close()
    }
    // Do not use writeTextAtomically: it follows symlinks and creates missing paths (#3271).
    // Re-read after preparing the temporary file; deletion must fail, never create a replacement from a stale read.
    const latest = await snapshot(projectRoot, path)
    if (
      latest.version !== version ||
      latest.target !== current.target ||
      latest.stat.dev !== current.stat.dev ||
      latest.stat.ino !== current.stat.ino ||
      latest.stat.mode !== current.stat.mode
    )
      return { status: 'conflict' }
    await rename(temporary, current.target)
    return { status: 'saved', version: versionOf(bytes), bytes: bytes.length }
  } finally {
    await rm(temporary, { force: true })
  }
}

export async function canonicalPath(projectRoot: string, path: string) {
  return (await locate(projectRoot, path)).target
}
