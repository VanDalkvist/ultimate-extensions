import { createServer } from 'node:http'
import { once } from 'node:events'

export const NODE = '🇫🇮 Demo / Unicode [Test] · №1'
export const SECOND = '🇩🇪 Germany — #2'

export async function fixture() {
  const state = {
    mode: 'rule', selected: NODE, general: 'PROXY', ai: 'PROXY',
    failure: '', failureMethod: '', failureCode: 503, malformed: false, empty: false,
    calls: [] as { method: string; path: string; body: unknown }[],
  }
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(req.url!.split('?')[0]!)
    let text = ''
    for await (const chunk of req) text += chunk
    const body = text ? JSON.parse(text) : null
    res.setHeader('content-type', 'application/json')
    if (path === '/__test') {
      if (req.method === 'POST') for (const key of ['mode', 'selected', 'general', 'ai', 'failure', 'failureMethod', 'failureCode', 'malformed', 'empty'] as const)
        if (key in body) Object.assign(state, { [key]: body[key] })
      res.end(JSON.stringify(state)); return
    }
    state.calls.push({ method: req.method!, path, body })
    if (state.failure === path && (!state.failureMethod || state.failureMethod === req.method)) { res.writeHead(state.failureCode).end('sensitive-upstream-detail'); return }
    if (path === '/version') { res.end(JSON.stringify({ version: '1.19.34' })); return }
    if (path === '/configs' && req.method === 'PATCH') state.mode = body.mode
    if (path === '/proxies/PROXY' && req.method === 'PUT') state.selected = body.name
    if (path === '/proxies/GENERAL-GATE' && req.method === 'PUT') state.general = body.name
    if (path === '/proxies/AI-GATE' && req.method === 'PUT') state.ai = body.name
    if (req.method !== 'GET') { res.writeHead(204).end(); return }
    const payload: Record<string, unknown> = {
      '/configs': { mode: state.mode, secret: 'not-exported', tun: { enable: true } },
      '/proxies': { proxies: {
        PROXY: { type: 'Selector', now: state.selected, all: [NODE, SECOND] },
        'GENERAL-GATE': { type: 'Selector', now: state.general, all: ['PROXY', 'DIRECT'] },
        'AI-GATE': { type: 'Selector', now: state.ai, all: ['PROXY', 'REJECT'] },
      } },
      '/providers/proxies': { providers: {
        personal: { name: 'Personal', vehicleType: 'HTTP', url: 'private-subscription', proxies: [
          { name: NODE, type: 'Trojan', alive: true, history: [{ delay: 42 }] },
          { name: 'dns-out', type: 'DNS', history: [] },
        ] },
        second: { name: 'Second', vehicleType: 'HTTP', proxies: [
          { name: SECOND, type: 'VLESS', alive: false, history: [{ delay: 0 }] },
        ] },
      } },
      '/group/PROXY/delay': { [NODE]: 37, [SECOND]: 0 },
    }
    if (state.empty && path === '/providers/proxies') payload[path] = { providers: {} }
    if (state.empty && path === '/proxies') payload[path] = { proxies: { PROXY: { type: 'Selector', now: null, all: [] } } }
    res.end(JSON.stringify(state.malformed ? { wrong: true } : payload[path]))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address() as { port: number }
  return {
    state, url: `http://127.0.0.1:${address.port}`,
    async close() { server.closeAllConnections(); await new Promise<void>((done, reject) => server.close(e => e ? reject(e) : done())) },
  }
}
