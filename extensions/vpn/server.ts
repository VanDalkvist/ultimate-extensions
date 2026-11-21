import { homedir } from 'node:os'
import { fileExists, openSettings, readSettings, settingsPaths } from './settings.ts'
import type { SettingsExec } from './settings.ts'
import { loadConnection } from './dependencies/mihomo-daemon/index.ts'
import { createController } from './controller.ts'
import { noArgs } from './contracts.ts'
import type { Context } from './contracts.ts'

import type { CommandQueue } from './controller.ts'
type ActionContext = Context & { host: { resource<T>(key: string, create: () => T): T } }

function controller(ctx: ActionContext) {
  const commands = ctx.host.resource<CommandQueue>('vpn.commands', () => ({ tail: Promise.resolve() }))
  return createController(() => loadConnection(), fetch, commands)
}

export default { name: 'vpn' }
export const pollActions = ['snapshot']
export const userActions = ['select', 'power', 'probe', 'openSettings']
export const actions = {
  settings: (args: unknown) => {
    noArgs(args)
    return readSettings(() => loadConnection(), settingsPaths(homedir()), fileExists)
  },
  openSettings: (args: unknown, ctx: Context & { exec: SettingsExec }) => openSettings(args, settingsPaths(homedir()), fileExists, ctx.exec),
  snapshot: (args: unknown, ctx: ActionContext) => controller(ctx).snapshot(args, ctx),
  select: (args: unknown, ctx: ActionContext) => controller(ctx).select(args, ctx),
  power: (args: unknown, ctx: ActionContext) => controller(ctx).power(args, ctx),
  probe: (args: unknown, ctx: ActionContext) => controller(ctx).probe(args, ctx),
}
