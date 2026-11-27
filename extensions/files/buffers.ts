import type { FileResult, SaveResult } from './types.ts'

export type FileBuffer = {
  id: number
  path: string
  text: string
  base: string
  version: string
  identity?: string
  replacedIdentities?: string[]
  bytes: number
  loading: boolean
  saving: boolean
  conflict: boolean
  restored?: boolean
  unconfirmed?: boolean
  error?: string
}
export type Buffers = { tabs: FileBuffer[]; active: string | null }

export const dirty = (file: FileBuffer) => file.text !== file.base || !!file.unconfirmed

/** Keep recovery if the user reverts to the old baseline during an in-flight save (#2840). */
export function beginSave(file: FileBuffer): FileBuffer {
  return { ...file, saving: true, unconfirmed: true, error: undefined }
}

let nextId = 0
export function opening(path: string): FileBuffer {
  return {
    id: ++nextId,
    path,
    text: '',
    base: '',
    version: '',
    bytes: 0,
    loading: true,
    saving: false,
    conflict: false,
  }
}

export function loaded(file: FileBuffer, result: FileResult): FileBuffer {
  return {
    ...file,
    text: result.secretText,
    base: result.secretText,
    version: result.version,
    identity: result.identity,
    replacedIdentities: undefined,
    bytes: result.bytes,
    loading: false,
    conflict: false,
    restored: false,
    unconfirmed: false,
    error: undefined,
  }
}

/** A completed save only acknowledges its captured text, never edits typed while it was in flight. */
export function saved(file: FileBuffer, text: string, result: SaveResult): FileBuffer {
  if (result.status === 'conflict')
    return { ...file, saving: false, conflict: true, unconfirmed: true }
  return {
    ...file,
    base: text,
    version: result.version,
    identity: result.identity,
    replacedIdentities: file.identity
      ? [...(file.replacedIdentities ?? []), file.identity].slice(-32)
      : file.replacedIdentities,
    bytes: result.bytes,
    saving: false,
    conflict: false,
    restored: false,
    unconfirmed: false,
    error: undefined,
  }
}

/** File bodies stay in this browser tab, not Ultimate's shared durable UI documents or call trace. */
export function snapshot(state: Buffers): string {
  return JSON.stringify({
    active: state.active,
    tabs: state.tabs.map((file) => ({
      path: file.path,
      ...(dirty(file)
        ? {
            draft: {
              text: file.text,
              base: file.base,
              version: file.version,
              bytes: file.bytes,
              unconfirmed: !!file.unconfirmed,
            },
          }
        : {}),
    })),
  })
}

export function restore(value: string | null): Buffers {
  if (!value) return { tabs: [], active: null }
  const data: unknown = JSON.parse(value)
  if (!data || typeof data !== 'object' || !('tabs' in data) || !Array.isArray(data.tabs))
    throw new Error('Invalid saved file tabs')
  const tabs = data.tabs.map((item: unknown) => {
    if (!item || typeof item !== 'object' || !('path' in item) || typeof item.path !== 'string')
      throw new Error('Invalid saved file tab')
    const file = opening(item.path)
    if (!('draft' in item)) return file
    const draft = item.draft
    if (
      !draft ||
      typeof draft !== 'object' ||
      !('text' in draft) ||
      typeof draft.text !== 'string' ||
      !('base' in draft) ||
      typeof draft.base !== 'string' ||
      !('version' in draft) ||
      typeof draft.version !== 'string' ||
      !('bytes' in draft) ||
      typeof draft.bytes !== 'number' ||
      !('unconfirmed' in draft) ||
      typeof draft.unconfirmed !== 'boolean'
    )
      throw new Error('Invalid saved file draft')
    return {
      ...file,
      text: draft.text,
      base: draft.base,
      version: draft.version,
      bytes: draft.bytes,
      unconfirmed: draft.unconfirmed,
      loading: false,
      restored: true,
    }
  })
  const active =
    'active' in data &&
    typeof data.active === 'string' &&
    tabs.some((file) => file.path === data.active)
      ? data.active
      : (tabs[0]?.path ?? null)
  return { tabs, active }
}
