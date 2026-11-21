import { readFile } from 'node:fs/promises'
import { join, posix, win32 } from 'node:path'
import { parseEnv } from 'node:util'
import { MihomoError } from './dependencies/mihomo-daemon/index.ts'
import type { SettingsPaths } from './settings.ts'

export type OpenOptions = { platform?: NodeJS.Platform; editor?: string }
export type SettingsConfig = OpenOptions & { paths: SettingsPaths; dashboardUrl?: string }

export function defaultPaths(home: string, platform: NodeJS.Platform = process.platform, arch = process.arch): SettingsPaths {
  const path = platform === 'win32' ? win32 : posix
  const daemon = platform === 'darwin'
    ? (arch === 'arm64' ? '/opt/homebrew' : '/usr/local') + '/etc/mihomo/config.yaml'
    : path.join(home, '.config', 'mihomo', 'config.yaml')
  return { daemon, connection: path.join(home, 'Projects', '.env') }
}

export async function loadSettingsConfig(
  home: string, exists: (path: string) => Promise<boolean>,
  platform: NodeJS.Platform = process.platform, arch = process.arch,
): Promise<SettingsConfig> {
  const paths = defaultPaths(home, platform, arch)
  let env: Record<string, string | undefined>
  try { env = parseEnv(await readFile(join(home, 'Projects', '.env'), 'utf8')) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw new MihomoError('config', 'Не удалось прочитать параметры файлов VPN из .env')
    env = {}
  }
  const configured = env.MIHOMO_CONFIG_PATH
  if (configured) {
    const path = platform === 'win32' ? win32 : posix
    if (!path.isAbsolute(configured) || /[\u0000-\u001f\u007f]/.test(configured))
      throw new MihomoError('config', 'MIHOMO_CONFIG_PATH должен быть абсолютным путём')
    paths.daemon = configured
  } else {
    const candidates = [paths.daemon]
    if (platform === 'darwin') candidates.push(
      (arch === 'arm64' ? '/usr/local' : '/opt/homebrew') + '/etc/mihomo/config.yaml',
      posix.join(home, '.config/mihomo/config.yaml'),
    )
    if (platform === 'linux' && process.env.XDG_CONFIG_HOME)
      candidates.push(posix.join(process.env.XDG_CONFIG_HOME, 'mihomo/config.yaml'))
    for (const candidate of candidates) if (await exists(candidate)) { paths.daemon = candidate; break }
  }
  const editor = env.MIHOMO_EDITOR || undefined
  if (editor && (editor.length > 1024 || /[\u0000-\u001f\u007f]/.test(editor)))
    throw new MihomoError('config', 'Некорректный MIHOMO_EDITOR')
  let dashboardUrl: string | undefined
  if (env.MIHOMO_DASHBOARD_URL) {
    let url: URL
    try { url = new URL(env.MIHOMO_DASHBOARD_URL) }
    catch { throw new MihomoError('config', 'Некорректный MIHOMO_DASHBOARD_URL') }
    const local = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) || url.hostname.endsWith('.localhost')
    if (!(url.protocol === 'https:' || url.protocol === 'http:' && local) || url.username || url.password || url.search || url.hash)
      throw new MihomoError('config', 'Dashboard URL требует HTTPS или loopback HTTP, без пароля, query и hash')
    dashboardUrl = url.href
  }
  return { paths, platform, editor, dashboardUrl }
}

export function openCommand(path: string, options: OpenOptions = {}) {
  const platform = options.platform ?? process.platform
  if (platform === 'darwin')
    return { command: '/usr/bin/open', args: options.editor ? ['-a', options.editor, path] : ['-t', path] }
  if (platform === 'linux' || platform === 'win32')
    return { command: options.editor ?? (platform === 'linux' ? 'xdg-open' : 'notepad.exe'), args: [path] }
  throw new MihomoError('config', 'Открытие файлов на этой платформе не поддерживается; скопируйте путь')
}
