export type ProviderId = 'codex' | 'claude' | 'opencode' | 'cursor' | 'antigravity'

export interface UsageWindow {
  id: string
  label: string
  remainingPercent: number
  resetsAt?: string
}

export interface ProviderUsage {
  id: ProviderId
  name: string
  state: 'ready' | 'unavailable' | 'error'
  reason?: string
  termsUrl?: string
  plan?: string
  source?: string
  checkedAt?: number
  fetchedAt?: number
  windows: UsageWindow[]
}

export interface UsageView {
  providers: ProviderUsage[]
  pins: string[]
  at: number
}

export const PROVIDERS = [
  { id: 'codex', name: 'Codex' },
  { id: 'claude', name: 'Claude' },
  { id: 'opencode', name: 'OpenCode Go' },
  { id: 'cursor', name: 'Cursor', termsUrl: 'https://cursor.com/terms-of-service' },
  { id: 'antigravity', name: 'Antigravity', termsUrl: 'https://antigravity.google/terms' },
] as const

export const DEFAULT_PINS = ['codex.weekly', 'claude.session', 'claude.weekly', 'opencode.rolling']
