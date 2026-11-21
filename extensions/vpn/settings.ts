import { stat } from 'node:fs/promises'
import { defaultPaths, openCommand } from './settings-platform.ts'
import type { OpenOptions } from './settings-platform.ts'
export { loadSettingsConfig } from './settings-platform.ts'
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
  openerAvailable: boolean
}
export type SettingsExec = (command: string, args: string[], options: { timeout: number }) => Promise<unknown>

export function settingsPaths(home: string, platform: NodeJS.Platform = process.platform, arch = process.arch): SettingsPaths {
  return defaultPaths(home, platform, arch)
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
  options: OpenOptions & { dashboardUrl?: string } = {},
): Promise<SettingsInfo> {
  const files = {
    daemon: { path: paths.daemon, exists: await exists(paths.daemon) },
    connection: { path: paths.connection, exists: await exists(paths.connection) },
  }
  const openerAvailable = ['darwin', 'linux', 'win32'].includes(options.platform ?? process.platform)
  try {
    const connection = await load()
    return { dashboardUrl: options.dashboardUrl ?? connection.baseUrl + '/ui/metacubexd/', apiUrl: connection.baseUrl, group: connection.group, issue: null, files, openerAvailable }
  } catch {
    return { dashboardUrl: options.dashboardUrl ?? null, apiUrl: null, group: null, issue: 'Ошибка параметров подключения; откройте файл .env для исправления', files, openerAvailable }
  }
}

export async function openSettings(
  args: unknown, paths: SettingsPaths, exists: (path: string) => Promise<boolean>, exec: SettingsExec,
  options: OpenOptions = {},
) {
  const file = commandArg(args, 'file')
  if (file !== 'daemon' && file !== 'connection') throw new MihomoError('invalid', 'Неизвестный файл настроек VPN')
  const path = paths[file]
  if (!await exists(path)) throw new MihomoError('config', 'Файл настроек не найден; путь можно скопировать в интерфейсе')
  const command = openCommand(path, options)
  try { await exec(command.command, command.args, { timeout: 5000 }) }
  catch { throw new MihomoError('api', 'Не удалось открыть файл в приложении на машине Ultimate. Скопируйте путь и откройте его вручную.') }
  return { dispatched: true, path }
}
