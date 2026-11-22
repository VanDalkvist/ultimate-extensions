import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// Cheap local admission gate. These guards intentionally fail if a future
// upstream facet sync silently drops validated host-specific behavior.
// They are NOT a substitute for a compiled macOS Ultimate / PTY smoke test.
const root = fileURLToPath(new URL('../', import.meta.url))
const source = (path) => readFileSync(join(root, path), 'utf8')
const exists = (path) => existsSync(join(root, path))

function walk(dir) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

test('every relative Terminal/Usage import resolves from the shipped source', () => {
  for (const folder of ['extensions/terminal', 'extensions/subscription-usage']) {
    const files = walk(folder).filter((path) => /\.(ts|tsx|mjs)$/.test(path) && !path.includes('/test/'))
    for (const file of files) {
      const contents = source(file)
      const imports = /(?:\bfrom\s*|\bimport\s*)['"](\.[^'"]+)['"]/g
      for (const match of contents.matchAll(imports)) {
        const dependency = resolve(dirname(join(root, file)), match[1])
        assert.ok(existsSync(dependency), file + ' imports absent ' + match[1])
      }
    }
  }
})

test('Usage server uses open-scope cleanup, never removed onRelease API', () => {
  const server = source('extensions/subscription-usage/server.ts')
  const life = source('extensions/subscription-usage/lifecycle.ts')
  assert.match(server, /registerUsageLifetime\(/)
  assert.doesNotMatch(server, /\bonRelease\s*\(/)
  assert.match(life, /scope\.defer\(/)
  assert.ok(exists('extensions/subscription-usage/test/lifecycle.test.ts'))
})

test('Usage status click and command open a visible panel on Agent surface', () => {
  const nav = source('extensions/subscription-usage/navigation.ts')
  const web = source('extensions/subscription-usage/web.solid.tsx')
  assert.match(nav, /showSurface\('agent'\)/)
  assert.ok(nav.indexOf("showSurface('agent')") < nav.indexOf("openPanel('subscription-usage')"))
  assert.match(web, /<StatusButton[\s\S]*?onClick=\{\(\) => openUsageDetails\(\{ showSurface, openPanel \}\)\}/)
  assert.match(web, /run: \(context\) => openUsageDetails\(context\)/)
  assert.ok(exists('extensions/subscription-usage/test/navigation.test.ts'))
})

test('Terminal preserves once-per-visit launch, shell choice and BFCache screen', () => {
  const web = source('extensions/terminal/web.solid.tsx')
  const auto = source('extensions/terminal/auto-start.ts')
  const replay = source('extensions/terminal/terminal-replay.ts')
  assert.match(web, /autoStartOnVisit\(/)
  assert.match(web, /useExtensionUiState/)
  assert.match(web, /terminalResumePlan\(/)
  assert.match(web, /captureRenderedSnapshot\(/)
  assert.match(web, /addEventListener\('pageshow', restore\)/)
  assert.match(auto, /let attempted = false/)
  assert.match(replay, /retained\?\.sessionId === opened\.sessionId/)
  assert.ok(exists('extensions/terminal/test/auto-start.test.ts'))
  assert.ok(exists('extensions/terminal/test/terminal-replay.test.ts'))
})

test('Terminal pagehide detaches user PTY; only Stop and fatal failure close', () => {
  const life = source('extensions/terminal/lifecycle.ts')
  const web = source('extensions/terminal/web.solid.tsx')
  assert.match(life, /pagehide: \(\) => release\(false\)/)
  assert.match(life, /stop: \(\) => release\(true\)/)
  assert.match(life, /failure === undefined/)
  assert.match(web, /pagehide\(\)/)
  assert.ok(exists('extensions/terminal/test/web/lifecycle.test.ts'))
})

test('Terminal retains native shell discovery, process cleanup and original limits', () => {
  const server = source('extensions/terminal/server.ts')
  assert.match(server, /installedShells/)
  assert.match(server, /shellForStart/)
  assert.match(server, /killSessionChildren/)
  assert.doesNotMatch(server, /spawn\('\/bin\/bash'/)
  assert.match(server, /600_000/)
  assert.ok(exists('extensions/terminal/test/shells.test.ts'))
  assert.ok(exists('extensions/terminal/test/session-processes.test.ts'))
})

test('installers ship full module closure and preserve project copies and data', () => {
  const terminal = source('scripts/install-terminal.sh')
  const usage = source('scripts/install-subscription-usage.sh')
  for (const script of [terminal, usage]) {
    assert.match(script, /\$source_dir"\/\*\.ts/)
    assert.match(script, /\$source_dir"\/\*\.solid\.tsx/)
    assert.match(script, /project_dir/)
    assert.match(script, /backup-\$stamp/)
    assert.match(script, /web\.tsx/)
    assert.doesNotMatch(script, /rm\s+-rf/)
  }
  for (const file of ['auto-start.ts', 'shell-launch.ts', 'lifecycle.ts'])
    assert.ok(exists('extensions/terminal/' + file), 'Terminal installer expects ' + file)
  for (const file of ['lifecycle.ts', 'navigation.ts'])
    assert.ok(exists('extensions/subscription-usage/' + file), 'Usage installer expects ' + file)
  assert.match(terminal, /node_modules\/node-pty/)
  assert.match(usage, /subscription-usage\.sqlite/)
})

test('only Solid web facet is discoverable; no resurrected React web.tsx', () => {
  for (const folder of ['extensions/terminal', 'extensions/subscription-usage']) {
    assert.ok(exists(folder + '/web.solid.tsx'))
    assert.ok(!exists(folder + '/web.tsx'))
  }
})
