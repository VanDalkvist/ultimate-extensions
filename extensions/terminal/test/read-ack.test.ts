import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

await test('an admitted read acknowledges consumed output once and resumes a paused PTY', async () => {
  let emit = (_bytes: Buffer) => {}
  const pause = mock.fn()
  const resume = mock.fn()
  mock.module('node-pty', {
    exports: {
      spawn: () => ({
        pid: process.pid,
        kill: () => {},
        pause,
        resume,
        onExit: () => {},
        onData: (fn: typeof emit) => {
          emit = fn
        },
      }),
    },
  })
  const { actions } = await import('../server.ts')
  const controller = new AbortController()
  const ctx = {
    host: { projectRoot: process.cwd() },
    device: { login: 'test', address: 'local' },
    signal: controller.signal,
  }
  const { secretToken } = (await actions.open({ cols: 80, rows: 24 }, ctx)) as {
    secretToken: string
  }
  const read = (cursor: number, ack?: true) =>
    actions.read({ secretToken, cursor, ...(ack ? { ack } : {}) }, ctx) as Promise<{
      cursor: number
      secretOutput: string
    }>
  const base = async () => ((await actions.inspect({}, ctx)) as { cursor: number }).cursor
  const burst = Buffer.concat(Array.from({ length: 6 }, (_, i) => Buffer.alloc(32 * 1024, i)))
  try {
    emit(burst)
    assert.equal(pause.mock.callCount(), 1)
    const chunks: Buffer[] = []
    let cursor = 0
    for (let i = 0; i < 6; i++) {
      const part = await read(cursor)
      chunks.push(Buffer.from(part.secretOutput, 'base64'))
      cursor = part.cursor
    }
    assert.deepEqual(Buffer.concat(chunks), burst)
    assert.equal(await base(), 0)

    // A poll at the tail holds the one slot. None of these failed reads may trim output.
    const poll = read(cursor)
    try {
      await assert.rejects(read(cursor, true))
      await assert.rejects(read(cursor + 1, true))
      await assert.rejects(
        actions.read(
          { secretToken, cursor, ack: true },
          { ...ctx, device: { ...ctx.device, login: 'other' } },
        ),
      )
      assert.equal(await base(), 0)
      assert.equal(resume.mock.callCount(), 0)
    } finally {
      emit(Buffer.from('next'))
      await poll
    }

    const first = await read(cursor, true)
    assert.equal(await base(), cursor)
    assert.equal(resume.mock.callCount(), 1)
    assert.equal(Buffer.from(first.secretOutput, 'base64').toString(), 'next')
    assert.deepEqual(await read(cursor, true), first)
    assert.equal(resume.mock.callCount(), 1)
    await assert.rejects(read(cursor - 1, true))
  } finally {
    controller.abort()
    await actions.close({ secretToken }, ctx)
    mock.restoreAll()
  }
})
