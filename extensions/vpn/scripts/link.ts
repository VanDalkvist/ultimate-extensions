import { lstat, mkdir, realpath, symlink } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function installLink(source: string, target: string, check: () => Promise<unknown>) {
  const canonical = await realpath(source)
  let existing
  try { existing = await lstat(target) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  if (existing && (!existing.isSymbolicLink() || await realpath(target) !== canonical))
    throw new Error('The VPN extension destination already exists; nothing was replaced')
  await check()
  if (existing) return { installed: true, changed: false, target }
  await mkdir(dirname(target), { recursive: true })
  await symlink(canonical, target, 'dir')
  if (await realpath(target) !== canonical) throw new Error('VPN extension symlink verification failed')
  return { installed: true, changed: true, target }
}
