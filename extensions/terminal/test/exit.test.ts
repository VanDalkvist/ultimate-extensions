import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

await test('natural and paused exits never kill the reaped PTY leader', async () => {
  let onExit = () => {}
  let onData = (_secretOutput: Buffer) => {}
  const kill = mock.fn()
  mock.module('node-pty', {
    exports: {
      spawn: () => ({
        pid: process.pid,
        kill,
        pause: () => {},
        onExit: (fn: () => void) => {
          onExit = fn
        },
        onData: (fn: (secretOutput: Buffer) => void) => {
          onData = fn
        },
      }),
    },
  })
  const { actions } = await import('../server.ts')
  const ctx = { host: { projectRoot: process.cwd() }, signal: new AbortController().signal }
  for (const paused of [false, true]) {
    const opened = (await actions.open({ cols: 80, rows: 24 }, ctx)) as { secretToken: string }
    if (paused) onData(Buffer.alloc(200 * 1024))
    onExit()
    const result = (await actions.read({ secretToken: opened.secretToken, cursor: 0 }, ctx)) as {
      reason: string | null
    }
    assert.equal(result.reason, paused ? 'output-incomplete' : null)
    await actions.close({ secretToken: opened.secretToken }, ctx)
  }
  assert.equal(kill.mock.callCount(), 0)
  mock.restoreAll()
})
