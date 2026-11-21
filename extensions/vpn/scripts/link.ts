import { lstat, mkdir, readlink, realpath, rename, symlink, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

export async function installLink(source: string, target: string, check: () => Promise<unknown>, replaceFrom?: string) {
  const canonical = await realpath(source)
  let existing
  try { existing = await lstat(target) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  let literal: string | undefined
  let same = false
  if (existing) {
    if (!existing.isSymbolicLink()) throw new Error('The VPN extension destination already exists; nothing was replaced')
    literal = await readlink(target)
    let current: string
    try { current = await realpath(target) }
    catch { throw new Error('The VPN extension destination already exists and is dangling; nothing was replaced') }
    same = current === canonical
    if (!same && (!replaceFrom || current !== await realpath(replaceFrom)))
      throw new Error('The VPN extension destination already exists; nothing was replaced')
  }
  await check()
  if (existing) {
    const after = await lstat(target)
    if (!after.isSymbolicLink() || after.ino !== existing.ino || await readlink(target) !== literal)
      throw new Error('The VPN extension destination changed during preflight; nothing was replaced')
    if (same) return { installed: true, changed: false, target }
    const temporary = join(dirname(target), '.vpn-' + randomUUID())
    try {
      await symlink(canonical, temporary, 'dir')
      await rename(temporary, target)
    } finally {
      await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error })
    }
  } else {
    await mkdir(dirname(target), { recursive: true })
    await symlink(canonical, target, 'dir')
  }
  if (await realpath(target) !== canonical) throw new Error('VPN extension symlink verification failed')
  return { installed: true, changed: true, target }
}
