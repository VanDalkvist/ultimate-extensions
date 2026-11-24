import { homedir } from 'node:os'
import { fileExists, openSettings, readSettings, settingsPaths, loadSettingsConfig } from './settings.ts'
import type { SettingsExec } from './settings.ts'
import { loadConnection } from './dependencies/mihomo-daemon/index.ts'
import { createController } from './controller.ts'
import { noArgs, commandArg } from './contracts.ts'
import type { Context } from './contracts.ts'

import type { CommandQueue } from './controller.ts'
type ActionContext = Context & { host: { resource<T>(key: string, create: () => T): T } }

function controller(ctx: ActionContext) {
  const commands = ctx.host.resource<CommandQueue>('vpn.commands', () => ({ tail: Promise.resolve() }))
  return createController(() => loadConnection(), fetch, commands)
}

export default { name: 'vpn' }
export const pollActions = ['snapshot']
export const userActions = ['select', 'power', 'aiPower', 'probe', 'openSettings']
export const actions = {
  settings: (args: unknown) => {
    noArgs(args)
    return (async () => {
      try {
        const config = await loadSettingsConfig(homedir(), fileExists)
        return readSettings(() => loadConnection(), config.paths, fileExists, config)
      } catch {
        const info = await readSettings(() => loadConnection(), settingsPaths(homedir()), fileExists)
        return { ...info, issue: 'Ошибка параметров файлов VPN; исправьте MIHOMO_CONFIG_PATH/EDITOR/DASHBOARD_URL в .env' }
      }
    })()
  },
  openSettings: async (args: unknown, ctx: Context & { exec: SettingsExec }) => {
    let config
    try { config = await loadSettingsConfig(homedir(), fileExists) }
    catch (error) {
      if (commandArg(args, 'file') !== 'connection') throw error
      return openSettings(args, settingsPaths(homedir()), fileExists, ctx.exec)
    }
    return openSettings(args, config.paths, fileExists, ctx.exec, config)
  },
  snapshot: (args: unknown, ctx: ActionContext) => controller(ctx).snapshot(args, ctx),
  select: (args: unknown, ctx: ActionContext) => controller(ctx).select(args, ctx),
  power: (args: unknown, ctx: ActionContext) => controller(ctx).power(args, ctx),
  aiPower: (args: unknown, ctx: ActionContext) => controller(ctx).aiPower(args, ctx),
  probe: (args: unknown, ctx: ActionContext) => controller(ctx).probe(args, ctx),
}
