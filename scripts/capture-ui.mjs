// Capture surfaces of the running Ultimate UI through the Chrome DevTools Protocol.
// usage: node capture-ui.mjs <base-url> <out-dir>

import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'

const base = process.argv[2] ?? 'http://127.0.0.1:4747'
const out = process.argv[3] ?? '.'
const chrome = process.env.CHROME ?? '/home/ubuntu/.local/bin/google-chrome'
const port = 9333

await mkdir(out, { recursive: true })
const child = spawn(
  chrome,
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--window-size=1440,900',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=/tmp/capture-ui-profile',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

let ws
for (let attempt = 0; attempt < 40; attempt += 1) {
  await sleep(250)
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    const page = list.find((entry) => entry.type === 'page')
    if (page?.webSocketDebuggerUrl) {
      ws = new WebSocket(page.webSocketDebuggerUrl)
      break
    }
  } catch {}
}

if (!ws) {
  child.kill()
  throw new Error('CDP page not reachable')
}

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true })
  ws.addEventListener('error', reject, { once: true })
})

let nextId = 1
const pending = new Map()
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(JSON.stringify(message.error)))
    else resolve(message.result)
  }
})

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })

const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  return result.result?.value
}

const capture = async (name, clip) => {
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
  })
  await writeFile(`${out}/${name}.png`, Buffer.from(shot.data, 'base64'))
  console.log('captured', name)
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: `${base}/` })
await sleep(6000)

/** Open a surface by its titlebar button, or a status-line chip by its text. */
const clickText = async (text) =>
  evaluate(`(() => {
    const wanted = ${JSON.stringify(text)};
    const nodes = [...document.querySelectorAll('button, a, [role="button"]')];
    const hit = nodes.find((node) => (node.textContent || '').trim() === wanted)
      ?? nodes.find((node) => (node.textContent || '').trim().startsWith(wanted));
    if (!hit) return 'not found';
    hit.click();
    return 'clicked';
  })()`)

// Обрезаем левую панель: в публичном README не нужны приватные названия веток.
// Stop above the status line: it can contain personal quota/cost data.
const content = { x: 296, y: 0, width: 1144, height: 840 }

for (const [name, label] of [
  ['files', 'Files'],
  ['terminal', 'Terminal'],
]) {
  const outcome = await clickText(label)
  console.log(name, '→', outcome)
  await sleep(3500)
  await capture(name, content)
}

// Quota/status-line captures are intentionally excluded from publication.

ws.close()
child.kill('SIGTERM')
await sleep(500)
