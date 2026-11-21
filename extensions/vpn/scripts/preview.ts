import { mkdtemp, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fixture } from '../test/fixture.ts'

const repo = resolve(import.meta.dirname, '..')
const ultimate = process.env.ULTIMATE_ROOT || resolve(repo, '../../../ultimate')
const root = await mkdtemp(join(tmpdir(), 'ultimate-vpn-preview-'))
const userHome = join(root, 'user')
const projectRoot = join(root, 'project')
await mkdir(join(userHome, '.ultimate/extensions'), { recursive: true })
await mkdir(join(userHome, 'Projects'), { recursive: true })
await mkdir(projectRoot)
const controller = await fixture()
await writeFile(join(userHome, 'Projects/.env'), `MIHOMO_API_URL=${controller.url}\n`)
const keep = new Set(['agent', 'sidebar', 'models', 'theme', 'status-line', 'system', 'ui', 'notices'])
const disabled: string[] = []
for (const entry of await readdir(join(ultimate, 'extensions'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const name = entry.name
  if (keep.has(name)) continue
  let api = ''
  try { api = await readFile(join(ultimate, 'extensions', name, 'api.ts'), 'utf8') } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  if (!/export const tier\s*=\s*['"]core['"]/.test(api)) disabled.push(name)
}
await writeFile(join(userHome, '.ultimate/settings.json'), JSON.stringify({ onboarding: false, extensions: { disable: disabled } }))
await writeFile(join(userHome, '.ultimate/onboarding.json'), '{"firstRunDone":true}')
await symlink(repo, join(userHome, '.ultimate/extensions/vpn'))
process.env.HOME = userHome
process.env.ULTIMATE_USER_HOME = userHome
for (const key of ['ULTIMATE_HOME','ULTIMATE_PROJECT','ULTIMATE_SUPERVISED','ULTIMATE_GENERATION']) delete process.env[key]
const { fauxProvider } = await import(pathToFileURL(join(ultimate, 'node_modules/@earendil-works/pi-ai/dist/providers/faux.js')).href)
const { createServer } = await import(pathToFileURL(join(ultimate, 'server/main.ts')).href)
const server = await createServer({ ultimateRoot: ultimate, projectRoot, userHome, home: join(root,'state'), port: 0, faux: fauxProvider({tokensPerSecond:0}) })
const info = { pid: process.pid, url: server.url, controller: controller.url, root }
if (process.env.BB_THREAD_STORAGE) await writeFile(join(process.env.BB_THREAD_STORAGE,'preview.json'),JSON.stringify(info,null,2))
console.log('VPN_PREVIEW_READY '+JSON.stringify(info))
let closing = false
async function close() {
  if (closing) return
  closing = true
  await server.close()
  await controller.close()
  process.exit(0)
}
process.on('SIGINT', close)
process.on('SIGTERM', close)
