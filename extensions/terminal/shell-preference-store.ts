export const shellPreferenceKey = 'ultimate.terminal.default-shell.v1'

export function validShellPreference(value: unknown): value is string {
  return typeof value === 'string' &&
    (value === 'system' || (value.startsWith('/') && value.length <= 4096))
}

export function readShellPreference(storage?: { getItem(key: string): string | null }): string {
  try {
    const chosen = storage?.getItem(shellPreferenceKey)
    return validShellPreference(chosen) ? chosen : 'system'
  } catch {
    return 'system'
  }
}

export function writeShellPreference(choice: string, storage: { setItem(key: string, value: string): void }) {
  if (!validShellPreference(choice)) throw new Error('Invalid terminal shell preference')
  storage.setItem(shellPreferenceKey, choice)
}
