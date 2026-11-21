import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { errnoCode } from './errors.ts'

export function killSessionChildren(leader: number, leaderExited: boolean, platform = process.platform) {
  if (!Number.isSafeInteger(leader) || leader <= 1) return
  const kill = (pid: number) => {
    try {
      process.kill(pid, 'SIGKILL')
    } catch (error) {
      if (errnoCode(error) !== 'ESRCH') console.error('Terminal process cleanup failed')
    }
  }
  if (platform === 'linux') {
    for (const entry of readdirSync('/proc')) {
      if (!/^\d+$/.test(entry)) continue
      const pid = Number(entry)
      if (pid <= 1 || pid === leader) continue
      try {
        const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
        const fields = stat.slice(stat.lastIndexOf(') ') + 2).split(' ')
        if (Number(fields[3]) === leader) kill(pid)
      } catch (error) {
        if (!['ENOENT', 'ESRCH'].includes(errnoCode(error) ?? ''))
          console.error('Terminal process cleanup failed')
      }
    }
  } else if (platform === 'darwin' && !leaderExited) {
    // Darwin ps exposes the controlling terminal device, not a numeric session ID.
    // Anchor it to our live leader in the same snapshot; a dead leader's tty can be reused.
    const rows = execFileSync('/bin/ps', ['-ax', '-o', 'pid=,ppid=,pgid=,tdev='], {
      encoding: 'utf8',
      timeout: 1000,
    }).split('\n').map((row) => row.trim().split(/\s+/))
    const tty = rows.find(([pid, parent, group]) =>
      Number(pid) === leader && Number(parent) === process.pid && Number(group) === leader,
    )?.[3]
    if (!tty || !/^\d+\/\d+$/.test(tty)) return
    for (const [pid, , , device] of rows) {
      if (device === tty && /^\d+$/.test(pid) && Number(pid) > 1 && Number(pid) !== leader)
        kill(Number(pid))
    }
  }
}
