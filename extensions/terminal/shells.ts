import { constants, accessSync, readFileSync, statSync } from 'node:fs'
import { basename, isAbsolute, normalize } from 'node:path'

/** Only shells whose interactive/login launch flags we explicitly support. */
const names = ['zsh', 'bash', 'fish'] as const
export type SupportedShell = typeof names[number]
export type ShellOption = { path: string; name: SupportedShell; origin: 'login' | 'system' | 'installed' }
export type ShellCatalog = { shells: ShellOption[]; systemDefault: string }

export type ShellProbe = {
  platform: string
  loginShell?: string
  shellsFile?: string
  executable(path: string): boolean
}

/** The fixed paths cover system, Homebrew (both Mac architectures), and Linuxbrew.
 * /etc/shells and the user's configured SHELL additionally cover Nix/custom paths.
 * Never execute shell discovery commands or scan project-owned PATH directories.
 */
export function detectShells(probe: ShellProbe): ShellCatalog {
  const candidates: Array<{ path: string; origin: ShellOption['origin'] }> = []
  if (probe.loginShell) candidates.push({ path: probe.loginShell, origin: 'login' })
  for (const line of (probe.shellsFile ?? '').split(/\r?\n/)) {
    const path = line.trim()
    if (path && !path.startsWith('#')) candidates.push({ path, origin: 'system' })
  }
  for (const directory of ['/bin', '/usr/bin', '/usr/local/bin', '/opt/homebrew/bin', '/home/linuxbrew/.linuxbrew/bin']) {
    for (const name of names) candidates.push({ path: directory + '/' + name, origin: 'installed' })
  }
  const shells: ShellOption[] = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    const path = candidate.path
    if (!isAbsolute(path) || normalize(path) !== path || seen.has(path)) continue
    const name = basename(path)
    if (!names.includes(name as SupportedShell) || !probe.executable(path)) continue
    seen.add(path)
    shells.push({ path, name: name as SupportedShell, origin: candidate.origin })
  }
  const preferred = [probe.loginShell, probe.platform === 'darwin' ? '/bin/zsh' : '/bin/bash']
  const systemDefault =
    preferred.find(path => shells.some(shell => shell.path === path)) ??
    shells[0]?.path ??
    ''
  return { shells, systemDefault }
}

export function installedShells(): ShellCatalog {
  let shellsFile = ''
  try { shellsFile = readFileSync('/etc/shells', 'utf8').slice(0, 16 * 1024) } catch { /* missing list */ }
  return detectShells({
    platform: process.platform,
    loginShell: process.env.SHELL,
    shellsFile,
    executable(path) {
      try {
        if (!statSync(path).isFile()) return false
        accessSync(path, constants.X_OK)
        return true
      } catch {
        return false
      }
    },
  })
}

export function shellForStart(selector: unknown, catalog: ShellCatalog): { path: string; args: string[]; name: SupportedShell } {
  if (typeof selector !== 'string' || !selector || selector === 'system') {
    if (selector !== undefined && selector !== 'system') throw new Error('Invalid terminal shell')
    selector = catalog.systemDefault
  }
  const matched = catalog.shells.find(item => item.path === selector)
  if (!matched) throw new Error('Selected terminal shell is unavailable')
  // All three support login (-l) and interactive (-i); user config is loaded.
  return { path: matched.path, args: ['-l', '-i'], name: matched.name }
}
