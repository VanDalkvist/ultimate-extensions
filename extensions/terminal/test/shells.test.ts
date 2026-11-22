import assert from 'node:assert/strict'
import { test } from 'node:test'
import { detectShells, shellForStart } from '../shells.ts'

function probe(options: {
  platform?: string
  loginShell?: string
  shellsFile?: string
  executablePaths?: string[]
} = {}) {
  const executable = new Set(options.executablePaths ?? ['/bin/bash', '/bin/zsh'])
  return {
    platform: options.platform ?? 'darwin',
    loginShell: options.loginShell,
    shellsFile: options.shellsFile ?? '/bin/zsh\n/bin/bash\n/bin/sh',
    executable: (path: string) => executable.has(path),
  }
}

test('find executable installed zsh and bash on Mac; prefer the login shell', () => {
  const catalog = detectShells(probe({ loginShell: '/bin/zsh' }))
  assert.deepEqual(catalog.shells.map(item => item.path), ['/bin/zsh', '/bin/bash'])
  assert.equal(catalog.systemDefault, '/bin/zsh')
  assert.deepEqual(shellForStart('system', catalog), { path: '/bin/zsh', args: ['-l', '-i'], name: 'zsh' })
})

test('fall back to macOS zsh and Linux bash when SHELL is absent', () => {
  assert.equal(detectShells(probe()).systemDefault, '/bin/zsh')
  assert.equal(detectShells(probe({ platform: 'linux' })).systemDefault, '/bin/bash')
})

test('fish in Homebrew is selectable if executable, even when not in /etc/shells', () => {
  const catalog = detectShells(probe({
    loginShell: '/bin/zsh',
    executablePaths: ['/bin/bash', '/bin/zsh', '/opt/homebrew/bin/fish'],
  }))
  assert.ok(catalog.shells.some(item => item.name === 'fish'))
  assert.deepEqual(shellForStart('/opt/homebrew/bin/fish', catalog), {
    path: '/opt/homebrew/bin/fish',
    args: ['-l', '-i'],
    name: 'fish',
  })
})

test('ignore unavailable binaries, unsupported login shells and any arbitrary project binary', () => {
  const catalog = detectShells(probe({
    loginShell: '/tmp/project/node_modules/.bin/zsh',
    shellsFile: '/bin/bash\n/bin/sh\n/evil/fake',
    executablePaths: ['/bin/bash', '/tmp/project/node_modules/.bin/zsh'],
  }))
  assert.deepEqual(catalog.shells.map(item => item.path), ['/bin/bash'])
  assert.throws(() => shellForStart('/tmp/project/node_modules/.bin/zsh', catalog), /unavailable/)
  assert.throws(() => shellForStart('/bin/sh', catalog), /unavailable/)
})

test('reject arbitrary shell selector even when it looks like a shell command', () => {
  const catalog = detectShells(probe())
  for (const invalid of ['/bin/zsh -c rm -rf ~', '../zsh', 'zsh', '', null, 42]) {
    assert.throws(() => shellForStart(invalid, catalog))
  }
})

test('missing executable shells cause a safe denial, not a fallback to unvalidated path', () => {
  const catalog = detectShells(probe({ executablePaths: [] }))
  assert.deepEqual(catalog.shells, [])
  assert.equal(catalog.systemDefault, '')
  assert.throws(() => shellForStart('system', catalog), /unavailable/)
})
