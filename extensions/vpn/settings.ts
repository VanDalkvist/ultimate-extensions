import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { MihomoError } from './dependencies/mihomo-daemon/index.ts'
import type { Connection } from './dependencies/mihomo-daemon/index.ts'
import { commandArg } from './contracts.ts'

export type SettingsPaths = { daemon: string; connection: string }
export type SettingsInfo = {
  dashboardUrl: string | null
  apiUrl: string | null
  group: string | null
  issue: string | null
  files: Record<keyof SettingsPaths, { path: string; exists: boolean }>
}
export type SettingsExec = (command: string, args: string[], options: { timeout: number }) => Promise<unknown>

export function settingsPaths(home: string): SettingsPaths {
  return { daemon: '/opt/homebrew/etc/mihomo/config.yaml', connection: join(home, 'Projects/.env') }
}

export async function fileExists(path: string): Promise<boolean> {
  try { return (await stat(path)).isFile() }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw new MihomoError('config', 'Не удалось проверить доступ к файлу настроек VPN')
  }
}

export async function readSettings(
  load: () => Promise<Connection>, paths: SettingsPaths, exists: (path: string) => Promise<boolean>,
  dashboardPath = '/ui/metacubexd/',
): Promise<SettingsInfo> {
  const files = {
    daemon: { path: paths.daemon, exists: await exists(paths.daemon) },
    connection: { path: paths.connection, exists: await exists(paths.connection) },
  }
  try {
    const connection = await load()
    return { dashboardUrl: connection.baseUrl + dashboardPath, apiUrl: connection.baseUrl, group: connection.group, issue: null, files }
  } catch {
    return { dashboardUrl: null, apiUrl: null, group: null, issue: 'Ошибка параметров подключения; откройте файл .env для исправления', files }
  }
}

export async function openSettings(
  args: unknown, paths: SettingsPaths, exists: (path: string) => Promise<boolean>, exec: SettingsExec,
) {
  const file = commandArg(args, 'file')
  if (file !== 'daemon' && file !== 'connection') throw new MihomoError('invalid', 'Неизвестный файл настроек VPN')
  const path = paths[file]
  if (!await exists(path)) throw new MihomoError('config', 'Файл настроек не найден; путь можно скопировать в интерфейсе')
  try { await exec('/usr/bin/open', ['-a', 'Zed', path], { timeout: 5000 }) }
  catch { throw new MihomoError('api', 'Не удалось передать файл в Zed. Откройте скопированный путь в редакторе на машине Ultimate.') }
  return { dispatched: true, path }
}
