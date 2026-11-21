import type { Mode } from './contracts.ts'

export function modeLabel(mode: Mode | null | undefined): string {
  return mode ? 'Mihomo · ' + { rule: 'Rule', direct: 'Direct', global: 'Global' }[mode] : 'Mihomo · нет данных'
}

function loopback(host: string) {
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host) || host.endsWith('.localhost')
}

export function canOpenDashboard(value: string | null | undefined, browserHost: string): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false
    return !loopback(url.hostname) || loopback(browserHost)
  } catch { return false }
}
