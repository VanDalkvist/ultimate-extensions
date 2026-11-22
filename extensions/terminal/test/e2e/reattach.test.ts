import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import extension, { actions } from '../../server.ts'

function isAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
    throw error
  }
}

test('a detached manual PTY survives the 30-second lease and replays executed output', {
  skip: !['darwin', 'linux'].includes(process.platform),
  timeout: 15_000,
}, async (t) => {
  let dispose = async () => {}
  const host = {
    projectRoot: process.cwd(),
    onClose: (fn: () => Promise<void>) => { dispose = fn },
  }
  t.after(async () => { await dispose() })
  extension(host)
  const ctx = {
    host,
    device: { login: 'reattach-test', address: 'local' },
    signal: new AbortController().signal,
  }
  const opened = await actions.open({ cols: 80, rows: 24, shell: '/bin/bash' }, ctx) as {
    pid: number
    secretToken: string
    sessionId: string
  }
  assert.equal(isAlive(opened.pid), true, 'real shell leader must exist')
  await actions.control({
    secretToken: opened.secretToken,
    // The shell echoes commands; match only the executed printf *result*.
    secretInput: Buffer.from("printf 'EXECUTED:%s\\n' 42\r").toString('base64'),
  }, ctx)
  let cursor = 0
  let output = ''
  const executed = /^EXECUTED:42\r?$/m
  for (let attempt = 0; attempt < 8 && !executed.test(output); attempt++) {
    const result = await actions.read({ secretToken: opened.secretToken, cursor }, ctx) as {
      cursor: number; secretOutput: string
    }
    cursor = result.cursor
    output += Buffer.from(result.secretOutput, 'base64').toString()
  }
  assert.match(output, executed, 'bash must execute the command, not merely echo input')
  assert.ok(cursor > 0)

  // Acknowledge bytes actually consumed by the viewport and retain replay.
  const ackSignal = new AbortController()
  const ack = actions.read(
    { secretToken: opened.secretToken, cursor, ack: true },
    { ...ctx, signal: ackSignal.signal },
  )
  await delay(50)
  ackSignal.abort()
  await ack

  const first = await actions.inspect({}, ctx) as {
    sessionId: string; pid: number; secretReplay: string; cursor: number
  }
  assert.equal(first.sessionId, opened.sessionId)
  assert.equal(first.pid, opened.pid)
  assert.match(
    Buffer.from(first.secretReplay, 'base64').toString(),
    executed,
    'replay must contain the executed command result',
  )
  assert.equal(first.cursor, cursor)

  const start = Date.now()
  t.mock.method(Date, 'now', () => start + 31_000)
  await delay(1100) // Allow the real expiry interval to inspect simulated 31 seconds.
  const resumed = await actions.inspect({}, ctx) as {
    sessionId: string; pid: number; secretToken: string
  }
  assert.equal(resumed.sessionId, opened.sessionId)
  assert.equal(resumed.pid, opened.pid, 'reattach must not spawn another PTY')
  assert.equal(resumed.secretToken, opened.secretToken)
  assert.equal(isAlive(opened.pid), true, 'shell must still be alive past the former 30-second lease')
  await actions.close({ secretToken: opened.secretToken }, ctx)
  for (let attempt = 0; attempt < 100 && isAlive(opened.pid); attempt++) await delay(20)
  assert.equal(isAlive(opened.pid), false, 'explicit close must terminate the original shell')
})
