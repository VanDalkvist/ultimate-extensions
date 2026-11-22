import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import extension, { actions } from '../../server.ts'

function alive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
    return false
  }
}

for (const mode of ['close', 'expiry'] as const) {
  test(`owned PTY ${mode} removes a foreground job and spares an unrelated control`, {
    skip: !['darwin', 'linux'].includes(process.platform),
    timeout: 12_000,
  }, async (t) => {
    const control = spawn('/bin/sleep', ['30'], { detached: true, stdio: 'ignore' })
    const controlDone = once(control, 'exit')
    await once(control, 'spawn')
    let dispose = async () => {}
    const host = {
      projectRoot: process.cwd(),
      onClose: (fn: () => Promise<void>) => { dispose = fn },
    }
    t.after(async () => {
      try {
        await dispose()
      } finally {
        control.kill()
        await controlDone
      }
    })
    extension(host)
    const ctx = {
      host,
      device: { login: 'pty-test', address: 'local' },
      signal: AbortSignal.timeout(6000),
    }
    const { pid, secretToken } = await actions.open({ cols: 80, rows: 24 }, ctx) as {
      pid: number
      secretToken: string
    }
    await actions.control({
      secretToken,
      secretInput: Buffer.from(
        `pwd; echo PTY-$((20+22)); /bin/sh -c 'printf "PTY_CHILD:%s\\n" "$$"; exec /bin/sleep 30'\r`,
      ).toString('base64'),
    }, ctx)
    let output = ''
    let cursor = 0
    let job: number | undefined
    while (!job) {
      const reply = await actions.read({ secretToken, cursor }, ctx) as {
        secretOutput: string
        cursor: number
      }
      cursor = reply.cursor
      output += Buffer.from(reply.secretOutput, 'base64').toString()
      const match = /^PTY_CHILD:(\d+)\r?$/m.exec(output)
      if (match) job = Number(match[1])
    }
    assert.ok(output.split(/\r?\n/).includes(host.projectRoot), 'pwd printed project root')
    assert.match(output, /^PTY-42\r?$/m, 'echo ran in the PTY')
    const pgid = Number(execFileSync('/bin/ps', ['-p', String(job), '-o', 'pgid='], { encoding: 'utf8' }))
    assert.equal(pgid, job, 'foreground job has its own process group')
    assert.notEqual(pgid, pid)
    assert.ok(alive(job) && alive(pid) && alive(control.pid!))
    if (mode === 'close') {
      await actions.close({ secretToken }, ctx)
    } else {
      // User-owned PTYs now survive a 30-second gap; only the absolute
      // ten-minute deadline expires them while their surface is hidden.
      const expiry = Date.now() + 601_000
      t.mock.method(Date, 'now', () => expiry)
      // Do not invoke another action: the ordinary expiry interval must clean up.
    }
    const deadline = performance.now() + 3000
    while ((alive(job) || alive(pid)) && performance.now() < deadline) await delay(25)
    assert.equal(alive(job), false, `foreground PID ${job} must be gone`)
    assert.equal(alive(pid), false, `shell PID ${pid} must be gone`)
    assert.ok(alive(control.pid!), 'unrelated owned control must remain alive')
    t.diagnostic(`pwd + echo verified; leader ${pid}, foreground group ${pgid} gone; control ${control.pid} alive`)
  })
}
