import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

await test('launch approval and session grants gate native terminal access', async () => {
  const write = mock.fn()
  const kill = mock.fn()
  const resize = mock.fn()
  let data = (_secretOutput: Buffer) => {}
  const spawn = mock.fn(() => ({
    pid: process.pid,
    cols: 80,
    rows: 24,
    write,
    kill,
    resize,
    pause: () => {},
    resume: () => {},
    onExit: () => {},
    onData: (fn: typeof data) => {
      data = fn
    },
  }))
  mock.module('node-pty', { exports: { spawn } })
  const { default: extension, actions } = await import('../server.ts')
  let dispose = () => {}
  const host = {
    projectRoot: process.cwd(),
    onClose: (fn: () => void) => {
      dispose = fn
    },
  }
  const definition = extension(host)
  const tool = definition.tools![0]
  assert.partialDeepStrictEqual(tool.parameters, { properties: { action: { type: 'string' } } })
  const native = async (action: string, args: Record<string, unknown> = {}, conversation = 10) => {
    const result = await tool.execute(
      { action, ...args } as never,
      { conversationId: conversation } as never,
      {} as never,
    )
    return result.details as Record<string, any>
  }
  const ctx = {
    host,
    device: { login: 'trial', address: 'local' },
    signal: new AbortController().signal,
  }
  const realNow = Date.now()
  const clock = mock.method(Date, 'now', () => realNow)
  try {
    const catalog = (await actions.shells({}, ctx)) as {
      systemDefault: string
      shells: Array<{ path: string }>
    }
    assert.ok(catalog.shells.some(option => option.path === catalog.systemDefault))
    assert.equal(spawn.mock.callCount(), 0, 'shell discovery must not create a PTY')
    await assert.rejects(actions.open({ cols: 80, rows: 24, shell: '/tmp/project/zsh' }, ctx))
    assert.equal(spawn.mock.callCount(), 0, 'invalid shell must be denied before spawn')
    assert.equal((await native('status')).state, 'denied')
    const denied = await native('open')
    assert.equal(spawn.mock.callCount(), 0)
    assert.deepEqual(await actions.deny({ requestId: denied.requestId, conversation: 99 }, ctx), {
      state: 'denied',
      conversation: 10,
    })
    assert.equal(spawn.mock.callCount(), 0)
    const expired = await native('open')
    assert.equal(expired.expires, realNow + 1_800_000)
    const launchAt = realNow + 1_801_000
    clock.mock.mockImplementation(() => launchAt)
    assert.deepEqual(await actions.approval({ requestId: expired.requestId }, ctx as never), {
      available: false,
    })
    await assert.rejects(actions.approve({ requestId: expired.requestId }, ctx))
    assert.equal(spawn.mock.callCount(), 0)
    const request = await native('open')
    assert.equal((await native('open')).state, 'busy')
    assert.equal(spawn.mock.callCount(), 0)
    await assert.rejects(actions.approve({ requestId: request.requestId, shell: '/tmp/fake-zsh' }, ctx))
    assert.equal(spawn.mock.callCount(), 0, 'invalid approved shell cannot spawn')
    assert.equal((await actions.approval({ requestId: request.requestId }, ctx) as { available: boolean }).available,
      true, 'bad preference does not consume pending approval')
    const approved = (await actions.approve(
      { requestId: request.requestId, conversation: 99 },
      ctx,
    )) as { conversation: number; sessionId: string }
    assert.equal(approved.conversation, 10)
    assert.ok(approved.sessionId)
    await assert.rejects(actions.approve({ requestId: request.requestId }, ctx))
    assert.equal(spawn.mock.callCount(), 1)
    assert.equal(spawn.mock.calls[0].arguments[0], catalog.systemDefault,
      'agent-owned shell uses the validated system default when no explicit selection is supplied')
    assert.deepEqual(spawn.mock.calls[0].arguments[1], ['-l', '-i'])
    const access = await native('status')
    assert.equal(access.grant.conversation, 10)
    assert.equal(access.grant.expires, launchAt + 300_000)
    const identity = { sessionId: access.sessionId, generation: access.grant.generation }
    data(Buffer.from('granted output'))
    assert.equal((await native('read', identity, 99)).state, 'denied')
    assert.equal(
      (await native('write', { ...identity, secretInput: 'forbidden' }, 99)).state,
      'denied',
    )
    assert.equal(write.mock.callCount(), 0)
    assert.equal((await native('read', identity)).secretOutput, 'granted output')
    assert.equal(
      (await native('write', { ...identity, secretInput: 'ok', enter: true })).state,
      'written',
    )
    assert.deepEqual(write.mock.calls[0].arguments[0], Buffer.from('ok\r'))
    const initialView = (await actions.inspect({}, ctx)) as { secretToken: string; cursor: number }
    assert.equal(initialView.cursor, 0)
    const firstRead = (await actions.read(initialView, ctx)) as { cursor: number }
    data(Buffer.from('after detach'))
    await actions.read(
      { secretToken: initialView.secretToken, cursor: firstRead.cursor, ack: true },
      ctx,
    )
    const reattached = (await actions.inspect({}, ctx)) as { secretToken: string; cursor: number }
    assert.equal(reattached.cursor, firstRead.cursor)
    assert.ok(reattached.cursor > 0)
    const nextRead = (await actions.read(reattached, ctx)) as { secretOutput: string }
    assert.equal(Buffer.from(nextRead.secretOutput, 'base64').toString(), 'after detach')
    await assert.rejects(actions.read({ secretToken: reattached.secretToken, cursor: 0 }, ctx))
    data(Buffer.alloc(80 * 1024, 'x'))
    const tail = await native('read', identity)
    assert.equal(tail.truncated, true)
    assert.equal(Buffer.byteLength(tail.secretOutput), 64 * 1024)
    const attached = (await actions.inspect({}, ctx)) as { secretToken: string }
    await actions.revoke({ secretToken: attached.secretToken }, ctx)
    assert.equal((await native('read', identity)).state, 'denied')
    assert.equal((await native('write', { ...identity, secretInput: 'forbidden' })).state, 'denied')
    await actions.grant({ secretToken: attached.secretToken, conversation: 10 }, ctx)
    assert.equal((await native('read', identity)).state, 'denied')
    const renewed = await native('status')
    const renewedId = { sessionId: renewed.sessionId, generation: renewed.grant.generation }
    assert.equal((await native('read', renewedId)).secretOutput, '')
    for (let elapsed = 25_000; elapsed <= 275_000; elapsed += 25_000) {
      clock.mock.mockImplementation(() => launchAt + elapsed)
      assert.equal((await native('status')).state, 'available')
    }
    clock.mock.mockImplementation(() => launchAt + 300_001)
    assert.equal((await native('read', renewedId)).state, 'denied')
    await actions.close({ secretToken: attached.secretToken }, ctx)
    for (const invalid of [0, -1]) {
      await assert.rejects(actions.open({ cols: invalid, rows: 1 }, ctx))
      await assert.rejects(actions.open({ cols: 1, rows: invalid }, ctx))
    }
    const manual = (await actions.open({ cols: 1, rows: 1 }, ctx)) as {
      secretToken: string
      cols: number
      rows: number
    }
    assert.deepEqual([manual.cols, manual.rows], [1, 1])
    await actions.control({ secretToken: manual.secretToken, cols: 1, rows: 1 }, ctx)
    assert.deepEqual(
      resize.mock.calls.map((call) => call.arguments),
      [[1, 1]],
    )
    for (const invalid of [0, -1]) {
      await assert.rejects(
        actions.control({ secretToken: manual.secretToken, cols: invalid, rows: 1 }, ctx),
      )
      await assert.rejects(
        actions.control({ secretToken: manual.secretToken, cols: 1, rows: invalid }, ctx),
      )
    }
    assert.equal(resize.mock.callCount(), 1)
    data(Buffer.from('pregrant private output'))
    assert.equal((await native('status')).state, 'denied')
    assert.equal((await native('write', { ...identity, secretInput: 'forbidden' })).state, 'denied')
    await actions.grant({ secretToken: manual.secretToken, conversation: 10 }, ctx)
    const manualAccess = await native('status')
    const manualId = {
      sessionId: manualAccess.sessionId,
      generation: manualAccess.grant.generation,
    }
    assert.notEqual(manualId.sessionId, identity.sessionId)
    assert.equal(
      (await native('read', { ...manualId, sessionId: identity.sessionId })).state,
      'denied',
    )
    assert.equal((await native('read', manualId)).secretOutput, '')
    const kills = kill.mock.callCount()
    assert.equal((await native('close', manualId)).state, 'denied')
    assert.equal(kill.mock.callCount(), kills)
    const manualAt = Date.now()
    let cursor = 0
    for (let elapsed = 25_000; elapsed <= 575_000; elapsed += 25_000) {
      clock.mock.mockImplementation(() => manualAt + elapsed)
      data(Buffer.from('.'))
      const read = (await actions.read(
        { secretToken: manual.secretToken, cursor, ...(cursor > 0 ? { ack: true } : {}) },
        ctx,
      )) as { cursor: number; ended: boolean }
      assert.equal(read.ended, false)
      cursor = read.cursor
    }
    clock.mock.mockImplementation(() => manualAt + 600_001)
    const expiredShell = (await actions.read({ secretToken: manual.secretToken, cursor }, ctx)) as {
      ended: boolean
    }
    assert.equal(expiredShell.ended, true)
    const next = await native('open')
    await actions.approve({ requestId: next.requestId }, ctx)
    const agent = await native('status')
    assert.equal(
      (await native('close', { sessionId: agent.sessionId, generation: agent.grant.generation }))
        .state,
      'closed',
    )
    assert.equal((await native('status')).state, 'denied')
  } finally {
    dispose()
    mock.restoreAll()
  }
})
