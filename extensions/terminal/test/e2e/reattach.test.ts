import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import extension, { actions } from '../../server.ts'

test('manual PTY survives a 30-second view gap and replays acknowledged output', {
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
  const opened = await actions.open({ cols: 80, rows: 24 }, ctx) as {
    pid: number
    secretToken: string
    sessionId: string
  }
  await actions.control({
    secretToken: opened.secretToken,
    secretInput: Buffer.from('echo REATTACH_TEST_42\r').toString('base64'),
  }, ctx)
  let cursor = 0
  let output = ''
  while (!output.includes('REATTACH_TEST_42')) {
    const result = await actions.read({ secretToken: opened.secretToken, cursor }, ctx) as {
      cursor: number; secretOutput: string
    }
    cursor = result.cursor
    output += Buffer.from(result.secretOutput, 'base64').toString()
  }
  assert.ok(cursor > 0)
  const ackSignal = new AbortController()
  const ack = actions.read(
    { secretToken: opened.secretToken, cursor, ack: true },
    { ...ctx, signal: ackSignal.signal },
  )
  await delay(50)
  ackSignal.abort()
  await ack

  const first = await actions.inspect({}, ctx) as {
    sessionId: string; secretReplay: string; cursor: number
  }
  assert.equal(first.sessionId, opened.sessionId)
  assert.ok(Buffer.from(first.secretReplay, 'base64').toString().includes('REATTACH_TEST_42'))
  assert.equal(first.cursor, cursor)

  const start = Date.now()
  t.mock.method(Date, 'now', () => start + 31_000)
  await delay(1100) // Allow the ordinary server expiry interval to fire.
  const resumed = await actions.inspect({}, ctx) as { sessionId: string; secretToken: string }
  assert.equal(resumed.sessionId, opened.sessionId)
  assert.equal(resumed.secretToken, opened.secretToken)
  await actions.close({ secretToken: opened.secretToken }, ctx)
})
