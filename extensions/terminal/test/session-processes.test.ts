import assert from 'node:assert/strict'
import { test } from 'node:test'

await test('Linux cleans matching session PIDs even after the PTY leader exits', async (t) => {
  const enoent = Object.assign(new Error('gone'), { code: 'ENOENT' })
  const stat = new Map([
    ['/proc/200/stat', '200 (shell) S 1 200 200 0 0'],
    ['/proc/201/stat', '201 (foreground ) job) S 200 201 200 0 0'],
    ['/proc/202/stat', '202 (other session) S 200 202 202 0 0'],
    ['/proc/203/stat', '203 (background) S 1 203 200 0 0'],
  ])
  t.mock.module('node:fs', {
    exports: {
      readdirSync: () => ['1', '200', '201', '202', '203', '204', 'self'],
      readFileSync: (path: string) => {
        if (!stat.has(path)) throw enoent
        return stat.get(path)
      },
    },
  })
  const kill = t.mock.method(process, 'kill', () => true)
  const { killSessionChildren } = await import('../session-processes.ts?linux')
  killSessionChildren(200, true, 'linux')
  assert.deepEqual(kill.mock.calls.map(({ arguments: args }) => args), [
    [201, 'SIGKILL'],
    [203, 'SIGKILL'],
  ])
})

await test('Darwin cleans jobs only on the controlling device of its live PTY leader', async (t) => {
  let parent = process.pid
  let tty = '16/3'
  const list = t.mock.fn(
    () => `200 ${parent} 200 S ${tty}\n201 200 201 S 16/3\n202 1 202 S 16/3\n203 200 203 S 16/4\n1 0 1 S ??\n204 1 204 S ??\n`,
  )
  t.mock.module('node:child_process', { exports: { execFileSync: list } })
  const kill = t.mock.method(process, 'kill', () => true)
  const { killSessionChildren } = await import('../session-processes.ts?darwin')
  killSessionChildren(200, true, 'darwin')
  assert.equal(list.mock.callCount(), 0, 'never look up a reaped leader')
  killSessionChildren(200, false, 'darwin')
  assert.deepEqual(kill.mock.calls.map(({ arguments: args }) => args), [
    [201, 'SIGKILL'],
    [202, 'SIGKILL'],
  ])
  kill.mock.resetCalls()
  parent = 1
  assert.equal(killSessionChildren(200, false, 'darwin'), false)
  parent = process.pid
  tty = '??'
  assert.equal(killSessionChildren(200, false, 'darwin'), true)
  assert.equal(kill.mock.callCount(), 0)
})

await test('Darwin close never signals the leader when the ownership snapshot is rejected', async (t) => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
  Object.defineProperty(process, 'platform', { ...platform, value: 'darwin' })
  t.after(() => { Object.defineProperty(process, 'platform', platform) })
  const leader = 200
  let snapshot = ''
  t.mock.module('node:child_process', { exports: { execFileSync: () => snapshot } })
  const leaderKill = t.mock.fn()
  t.mock.module('node-pty', {
    exports: {
      spawn: () => ({ pid: leader, kill: leaderKill, onData() {}, onExit() {} }),
    },
  })
  const { actions } = await import('../server.ts')
  const ctx = { host: { projectRoot: process.cwd() }, signal: new AbortController().signal }
  for (const row of [
    '',
    `${leader} 1 ${leader} S 16/3`,
    `${leader} ${process.pid} 201 S 16/3`,
    `${leader} ${process.pid} ${leader} Z ??`,
  ]) {
    snapshot = row
    const { secretToken } = (await actions.open({ cols: 80, rows: 24 }, ctx)) as {
      secretToken: string
    }
    assert.deepEqual(await actions.close({ secretToken }, ctx), { ok: true })
    assert.equal(leaderKill.mock.callCount(), 0, `rejected snapshot: ${row}`)
  }
  snapshot = `${leader} ${process.pid} ${leader} S 16/3`
  const { secretToken } = (await actions.open({ cols: 80, rows: 24 }, ctx)) as {
    secretToken: string
  }
  await actions.close({ secretToken }, ctx)
  assert.deepEqual(leaderKill.mock.calls.map(({ arguments: args }) => args), [['SIGKILL']])
})
