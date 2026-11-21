import type { Mode } from './contracts.ts'

export function modeLabel(mode: Mode | null | undefined): string {
  return mode ? 'Mihomo · ' + { rule: 'Rule', direct: 'Direct', global: 'Global' }[mode] : 'Mihomo · нет данных'
}

export function isLoopbackHost(host: string) {
  const normalized = host.toLowerCase().replace(/\.$/, '')
  return ['localhost', '[::1]', '::1'].includes(normalized) || /^127(?:\.\d{1,3}){3}$/.test(normalized) || normalized.endsWith('.localhost')
}

export function canOpenDashboard(value: string | null | undefined, browserHost: string): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false
    return !isLoopbackHost(url.hostname) || isLoopbackHost(browserHost)
  } catch { return false }
}
