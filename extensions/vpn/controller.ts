import { MihomoClient, MihomoError as VpnError } from './dependencies/mihomo-daemon/index.ts'
import type { Connection, Fetch } from './dependencies/mihomo-daemon/index.ts'
import { MihomoAdapter } from './adapter.ts'
import { VpnService } from './service.ts'
import { commandArg, noArgs, text } from './contracts.ts'
import type { Context, Snapshot } from './contracts.ts'

export type CommandQueue = { tail: Promise<unknown> }

export function createController(connection: () => Promise<Connection>, fetcher: Fetch, commands: CommandQueue = { tail: Promise.resolve() }) {
  const service = async () => new VpnService(new MihomoAdapter(new MihomoClient(await connection(), fetcher)))
  const queue = <T>(run: () => Promise<T>) => {
    const next = commands.tail.then(run, run)
    commands.tail = next.catch(() => undefined)
    return next
  }
  const booleanArg = (args: unknown) => {
    const enabled = commandArg(args, 'enabled')
    if (typeof enabled !== 'boolean') throw new VpnError('invalid', 'enabled должен быть boolean')
    return enabled
  }
  return {
    async snapshot(args: unknown, ctx: Context): Promise<Snapshot> {
      noArgs(args)
      try { return await (await service()).read(ctx.signal) }
      catch (error) {
        if (ctx.signal.aborted) throw error
        const issue = error instanceof VpnError
          ? { code: error.code, message: error.message }
          : { code: 'api' as const, message: 'Не удалось прочитать состояние VPN' }
        return {
          issue, enabled: false, mode: null, activeProxy: null, activeDelay: null,
          version: null, group: '', providers: [], generalGate: null, aiGate: null,
        }
      }
    },
    async select(args: unknown, ctx: Context) {
      const name = text(commandArg(args, 'node'))
      return queue(async () => (await service()).select(name, ctx.signal))
    },
    async power(args: unknown, ctx: Context) {
      const enabled = booleanArg(args)
      return queue(async () => (await service()).power(enabled, ctx.signal))
    },
    async aiPower(args: unknown, ctx: Context) {
      const enabled = booleanArg(args)
      return queue(async () => (await service()).aiPower(enabled, ctx.signal))
    },
    async probe(args: unknown, ctx: Context) {
      noArgs(args)
      return queue(async () => (await service()).probe(ctx.signal))
    },
  }
}
