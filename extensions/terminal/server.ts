import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { setTimeout, clearTimeout, setInterval, clearInterval } from 'node:timers'
import { bool, num, obj, oneOf, opt, str } from '@earendil-works/pi-schema'
import { defineExtension, defineTool } from '@earendil-works/pi-durable'
import type { JsonValue } from '@earendil-works/chord/json'
import { spawn, type IPty } from 'node-pty'
import { errnoCode } from './errors.ts'
import { readLongpollMs } from './refs.ts'
import { killSessionChildren } from './session-processes.ts'

type Context = {
  host: { projectRoot: string }
  device?: { login?: string; address?: string }
  signal: AbortSignal
}
type Session = {
  pty: IPty
  id: string
  owner: 'user' | 'agent'
  grant?: { conversation: number; expires: number; generation: string }
  agentBuffer: Buffer
  agentEnd: number
  secretToken: string
  login?: string
  address?: string
  buffer: Buffer
  history: Buffer
  base: number
  sent: number
  input: number
  paused: boolean
  reading: boolean
  ended: boolean
  incomplete: boolean
  wake?: () => void
  lease: number
  deadline: number
}
const historyLimit = 128 * 1024
function expired(s: Session) {
  const now = Date.now()
  // Manual shells survive a hidden view, but not the absolute deadline.
  // Agent-owned shells keep the shorter renewable lease.
  return now >= s.deadline || (s.owner === 'agent' && now >= s.lease)
}

let session: Session | undefined
let pending: { id: string; conversation: number; expires: number } | undefined
function revoke(s: Session) {
  s.grant = undefined
  s.agentBuffer = Buffer.alloc(0)
  s.agentEnd = 0
}
function grant(s: Session, conversation: number) {
  revoke(s)
  s.grant = {
    conversation,
    expires: Math.min(Date.now() + 300_000, s.deadline),
    generation: randomUUID(),
  }
}
function metadata(s: Session) {
  if (s.grant && s.grant.expires <= Date.now()) revoke(s)
  return { sessionId: s.id, owner: s.owner, grant: s.grant ?? null }
}
const fail = () => new Error('Terminal request failed')

function terminate(s: Session, leaderExited = false) {
  if (s.ended) return
  s.ended = true
  revoke(s)
  let signalLeader = !leaderExited && process.platform !== 'darwin'
  try {
    if (killSessionChildren(s.pty.pid, leaderExited)) signalLeader = true
  } catch {
    console.error('Terminal process cleanup failed')
  } finally {
    try {
      // On Darwin the native wait can reap the leader before JS receives onExit.
      if (signalLeader) s.pty.kill('SIGKILL')
    } catch (error) {
      if (errnoCode(error) !== 'ESRCH') console.error('Terminal PTY cleanup failed')
    }
    s.wake?.()
  }
}

export default function (host: { projectRoot: string; onClose(fn: () => Promise<void>): void }) {
  const expiry = setInterval(() => {
    if (session?.grant && Date.now() >= session.grant.expires) revoke(session)
    if (session && expired(session)) terminate(session)
  }, 1000).unref()
  host.onClose(async () => {
    clearInterval(expiry)
    if (session) terminate(session)
    session = undefined
    pending = undefined
  })
  return defineExtension({
    name: 'terminal',
    tools: [
      defineTool({
        name: 'terminal',
        description:
          'Bounded host terminal trial. open requests a separate user Approve for each new shell; never launches by itself. Manual shells require explicit five-minute user grant. status returns sessionId/generation for your grant; read/write/close require both. read is immediate, bounded and may be truncated; output enters your conversation. write secretInput is UTF8 with optional enter (or control keys), max8KiB; never retry interrupted writes. close only closes agent-owned shells; arbitrary write still has full OS user privileges, not a command sandbox.',
        parameters: obj({
          // https://github.com/HazAT/ultimate/pull/79: Kimi rejects a bare enum
          // without type. Drop this override when pi-schema oneOf emits type itself.
          action: {
            ...oneOf(['status', 'open', 'read', 'write', 'close'] as const),
            type: 'string',
          },
          sessionId: opt(str()),
          generation: opt(str()),
          cursor: opt(num()),
          secretInput: opt(str({ maxLength: 8192 })),
          enter: opt(bool()),
        }),
        async execute(args, api) {
          let result: NativeReply
          try {
            result = nativeTerminal(args, api.conversationId, host.projectRoot)
          } catch {
            result = { state: 'denied' }
          }
          return {
            output: [{ type: 'text' as const, text: JSON.stringify(result) }],
            details: result,
          }
        },
      }),
    ],
  })
}

function object(value: JsonValue): Record<string, JsonValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail()
  return value
}
function integer(value: JsonValue | undefined, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    throw fail()
  return value
}
function authorized(args: Record<string, JsonValue>, ctx: Context) {
  const s = session
  const supplied =
    typeof args.secretToken === 'string' ? Buffer.from(args.secretToken) : Buffer.alloc(0)
  const expected = Buffer.from(s?.secretToken ?? '')
  if (
    !s ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected) ||
    s.login !== ctx.device?.login ||
    s.address !== ctx.device?.address
  )
    throw fail()
  if (expired(s)) terminate(s)
  return s
}
function acknowledge(s: Session, cursor: number) {
  // Replay acknowledged output in a new viewport without retaining an
  // unbounded transcript or interfering with flow control.
  s.history = Buffer.concat([s.history, s.buffer.subarray(0, cursor - s.base)]).subarray(
    -historyLimit,
  )
  s.buffer = s.buffer.subarray(cursor - s.base)
  s.base = cursor
  if (s.paused && s.buffer.length <= 64 * 1024 && !s.ended) {
    s.pty.resume()
    s.paused = false
  }
}
function guarded(
  fn: (args: Record<string, JsonValue>, ctx: Context) => JsonValue | Promise<JsonValue>,
) {
  return async (args: JsonValue, ctx: Context): Promise<JsonValue> => {
    try {
      return await fn(object(args), ctx)
    } catch {
      // Never propagate native errors: they can include terminal input or output.
      throw fail()
    }
  }
}
type NativeReply = {
  state: 'pending' | 'available' | 'read' | 'written' | 'closed' | 'denied' | 'busy'
  requestId?: string
  conversation?: number
  expires?: number
  cwd?: string
  sessionId?: string
  owner?: 'user' | 'agent'
  grant?: Session['grant'] | null
  cursor?: number
  truncated?: boolean
  secretOutput?: string
}
type NativeArgs = {
  action: string
  sessionId?: string
  generation?: string
  cursor?: number
  secretInput?: string
  enter?: boolean
}
function nativeTerminal(args: NativeArgs, conversation: number, cwd: string): NativeReply {
  if (args.action === 'open') {
    if ((session && !session.ended) || (pending && pending.expires > Date.now()))
      return { state: 'busy' }
    pending = { id: randomUUID(), conversation, expires: Date.now() + 1_800_000 }
    return { state: 'pending', requestId: pending.id, conversation, expires: pending.expires, cwd }
  }
  const s = session
  if (s?.grant && s.grant.expires <= Date.now()) revoke(s)
  if (!s || s.ended || !s.grant || s.grant.conversation !== conversation) throw fail()
  if (
    args.action !== 'status' &&
    (args.sessionId !== s.id || args.generation !== s.grant.generation)
  )
    throw fail()
  if (expired(s)) {
    terminate(s)
    throw fail()
  }
  if (args.action === 'status') {
    s.lease = Date.now() + 30_000
    return { state: 'available', ...metadata(s), cwd }
  }
  if (args.action === 'read') {
    const cursor = integer(args.cursor ?? 0, 0, s.agentEnd)
    s.lease = Date.now() + 30_000
    const base = s.agentEnd - s.agentBuffer.length
    return {
      state: 'read',
      sessionId: s.id,
      cursor: s.agentEnd,
      truncated: cursor < base,
      secretOutput: s.agentBuffer.subarray(Math.max(0, cursor - base)).toString('utf8'),
    }
  }
  if (args.action === 'write') {
    if ((args.secretInput?.length ?? 0) > 8192) throw fail()
    const bytes = Buffer.from((args.secretInput ?? '') + (args.enter ? '\r' : ''), 'utf8')
    if (bytes.length > 8192 || s.input + bytes.length > 1024 * 1024) throw fail()
    s.lease = Date.now() + 30_000
    s.input += bytes.length
    s.pty.write(bytes)
    return { state: 'written', sessionId: s.id }
  }
  if (args.action === 'close' && s.owner === 'agent') {
    terminate(s)
    return { state: 'closed', sessionId: s.id }
  }
  throw fail()
}

export const userActions = [
  'open',
  'read',
  'control',
  'close',
  'approval',
  'approve',
  'deny',
  'grant',
  'revoke',
  'inspect',
]
export const pollActions = ['read']
export const actions = {
  open: guarded((args, ctx) => {
    if (session && !session.ended) throw fail()
    const cols = integer(args.cols, 1, 500)
    const rows = integer(args.rows, 1, 200)
    const pty = spawn('/bin/bash', ['--noprofile', '--norc', '-i'], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: ctx.host.projectRoot,
      env: { ...process.env, HISTFILE: '/dev/null' },
      encoding: null,
    })
    const s: Session = {
      pty,
      id: randomUUID(),
      owner: 'user',
      agentBuffer: Buffer.alloc(0),
      agentEnd: 0,
      secretToken: randomBytes(32).toString('hex'),
      login: ctx.device?.login,
      address: ctx.device?.address,
      buffer: Buffer.alloc(0),
      history: Buffer.alloc(0),
      base: 0,
      sent: 0,
      input: 0,
      paused: false,
      reading: false,
      ended: false,
      incomplete: false,
      lease: Date.now() + 30_000,
      deadline: Date.now() + 600_000,
    }
    session = s
    pty.onData((secretOutput) => {
      const bytes = Buffer.from(secretOutput as unknown as Buffer)
      if (s.ended) return
      if (s.grant && s.grant.expires <= Date.now()) revoke(s)
      if (s.grant) {
        s.agentEnd += bytes.length
        s.agentBuffer = Buffer.concat([s.agentBuffer, bytes]).subarray(-64 * 1024)
      }
      if (s.buffer.length + bytes.length > 256 * 1024) {
        s.incomplete = true
        terminate(s)
        return
      }
      s.buffer = Buffer.concat([s.buffer, bytes])
      if (s.buffer.length >= 192 * 1024 && !s.paused) {
        pty.pause()
        s.paused = true
      }
      s.wake?.()
    })
    pty.onExit(() => {
      // #47345/review50791: node-pty 1.1.0 destroys a paused read socket
      // 200ms after child exit. Remaining kernel bytes cannot be promised here.
      if (s.paused) s.incomplete = true
      terminate(s, true)
    })
    return {
      secretToken: s.secretToken,
      pid: pty.pid,
      cwd: ctx.host.projectRoot,
      cols,
      rows,
      cursor: 0,
      ...metadata(s),
    }
  }),
  read: guarded(async (args, ctx) => {
    const s = authorized(args, ctx)
    const cursor = integer(args.cursor, s.base, s.sent)
    if (args.ack !== undefined && args.ack !== true) throw fail()
    // A competing reader must not steal the in-flight cursor or ack bytes.
    // Authorized viewport handoff uses the explicit control/resize command.
    if (s.reading || ctx.signal.aborted) throw fail()
    s.reading = true
    try {
      if (args.ack && cursor > s.base) acknowledge(s, cursor)
      if (!s.ended) s.lease = Date.now() + 30_000
      if (cursor === s.base + s.buffer.length && !s.ended && !ctx.signal.aborted) {
        await new Promise<void>((resolve) => {
          const wake = () => {
            clearTimeout(timer)
            ctx.signal.removeEventListener('abort', wake)
            s.wake = undefined
            resolve()
          }
          const timer = setTimeout(wake, readLongpollMs)
          s.wake = wake
          ctx.signal.addEventListener('abort', wake, { once: true })
          if (ctx.signal.aborted) wake()
        })
      }
      const bytes = s.buffer.subarray(cursor - s.base, cursor - s.base + 32 * 1024)
      const next = cursor + bytes.length
      s.sent = Math.max(s.sent, next)
      return {
        secretOutput: bytes.toString('base64'),
        cursor: next,
        ended: s.ended && next === s.base + s.buffer.length,
        buffered: s.buffer.length,
        paused: s.paused,
        reason: s.incomplete ? 'output-incomplete' : null,
        ...metadata(s),
      }
    } finally {
      s.reading = false
    }
  }),
  control: guarded((args, ctx) => {
    const s = authorized(args, ctx)
    if (
      s.ended ||
      Object.keys(args).some(
        (name) => !['secretToken', 'secretInput', 'cols', 'rows'].includes(name),
      )
    )
      throw fail()
    if (args.cols !== undefined || args.rows !== undefined) {
      s.pty.resize(integer(args.cols, 1, 500), integer(args.rows, 1, 200))
      // This is an authenticated command. The remounted view resizes first;
      // wake an old long-poll before it starts reading from the retained base.
      s.wake?.()
    }
    if (args.secretInput !== undefined) {
      if (
        typeof args.secretInput !== 'string' ||
        args.secretInput.length > 12_000 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(args.secretInput)
      )
        throw fail()
      const bytes = Buffer.from(args.secretInput, 'base64')
      if (bytes.length > 8192 || s.input + bytes.length > 1024 * 1024) {
        terminate(s)
        throw fail()
      }
      s.input += bytes.length
      s.pty.write(bytes)
    }
    return { ok: true }
  }),
  approval: guarded((args) => ({
    available: !!pending && pending.id === args.requestId && pending.expires > Date.now(),
  })),
  approve: guarded(async (args, ctx) => {
    const p = pending
    if (!p || p.id !== args.requestId || p.expires <= Date.now() || (session && !session.ended))
      throw fail()
    pending = undefined // Consume before spawn: a repeated click cannot start another shell.
    await actions.open({ cols: 80, rows: 24 }, ctx)
    const s = session!
    s.owner = 'agent'
    grant(s, p.conversation)
    return { state: 'approved', conversation: p.conversation, ...metadata(s) }
  }),
  deny: guarded((args) => {
    const p = pending
    if (!p || p.id !== args.requestId || p.expires <= Date.now()) throw fail()
    pending = undefined
    return { state: 'denied', conversation: p.conversation }
  }),
  inspect: guarded((_args, ctx) => {
    const s = session
    if (s && expired(s)) terminate(s)
    if (!s || s.ended || s.login !== ctx.device?.login || s.address !== ctx.device?.address)
      return null
    // Inspect is read-only: a passive view must not interrupt a reader.
    return {
      secretToken: s.secretToken,
      secretReplay: s.history.toString('base64'),
      pid: s.pty.pid,
      cwd: ctx.host.projectRoot,
      cols: s.pty.cols,
      rows: s.pty.rows,
      // #47345: reattachment starts at retained bytes, not acknowledged history.
      cursor: s.base,
      ...metadata(s),
    }
  }),
  grant: guarded((args, ctx) => {
    const s = authorized(args, ctx)
    if (s.ended) throw fail()
    grant(s, integer(args.conversation, 1, Number.MAX_SAFE_INTEGER))
    return metadata(s)
  }),
  revoke: guarded((args, ctx) => {
    const s = authorized(args, ctx)
    revoke(s)
    return metadata(s)
  }),
  close: guarded((args, ctx) => {
    terminate(authorized(args, ctx))
    return { ok: true }
  }),
}
