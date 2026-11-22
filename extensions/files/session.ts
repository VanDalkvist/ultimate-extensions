import { createEffect, createSignal, onSettled } from 'solid-js'
import { actionRef, api, errorMessage } from '@/sdk/solid'
import type { DirectoryResult, FileResult, SaveResult } from './types.ts'
import { beginSave, dirty, loaded, opening, restore, saved, snapshot } from './buffers.ts'
import type { Buffers, FileBuffer } from './buffers.ts'

export const List = actionRef<{ path: string }, DirectoryResult>('files', 'list')
const Read = actionRef<{ path: string }, FileResult>('files', 'read')
const Save = actionRef<{ path: string; secretText: string; version: string }, SaveResult>(
  'files',
  'save',
)

type Session = Buffers & { storageError?: string }
const sessions = new Map<string, ReturnType<typeof createSession>>()

export function createSession(root: string) {
  const key = `ultimate.files:${root}`
  let state: Session
  try {
    state = restore(sessionStorage.getItem(key))
  } catch {
    // Storage may be denied or a restored draft invalid; show the loss of recovery, not a false Saved state.
    state = {
      tabs: [],
      active: null,
      storageError: 'Could not restore browser drafts. Keep unsaved work in this tab.',
    }
  }
  const listeners = new Set<() => void>()
  const requests = new Set<number>()
  const timers = new Map<number, ReturnType<typeof setTimeout>>()
  const paused = new Set<number>()
  function cancel(id: number) {
    clearTimeout(timers.get(id))
    timers.delete(id)
  }
  function schedule(id: number) {
    cancel(id)
    const file = state.tabs.find((item) => item.id === id)
    if (!file || paused.has(id) || file.loading || file.error || file.conflict || !dirty(file))
      return
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id)
        save(id)
      }, 700),
    )
  }
  function update(change: (current: Session) => Session) {
    state = change(state)
    try {
      sessionStorage.setItem(key, snapshot(state))
      state = { ...state, storageError: undefined }
    } catch {
      // Typing must still work when storage is full or disabled, with an explicit warning about reload recovery.
      state = {
        ...state,
        storageError:
          'Browser draft storage is unavailable. Unsaved edits survive screen switches, but not a reload.',
      }
    }
    for (const listener of listeners) listener()
  }
  function patch(id: number, change: (file: FileBuffer) => FileBuffer) {
    update((current) => ({
      ...current,
      tabs: current.tabs.map((file) => (file.id === id ? change(file) : file)),
    }))
  }
  function save(id: number) {
    cancel(id)
    const file = state.tabs.find((item) => item.id === id)
    if (
      !file ||
      paused.has(id) ||
      file.loading ||
      file.saving ||
      file.conflict ||
      file.error ||
      !file.version ||
      !dirty(file)
    )
      return
    patch(id, beginSave)
    api
      .action(Save, { path: file.path, secretText: file.text, version: file.version })
      .then((result) => {
        patch(id, (current) => saved(current, file.text, result))
        // Edits made during a write wait for its version before the next autosave (#2840).
        schedule(id)
      })
      .catch((error: unknown) =>
        patch(id, (current) => ({ ...current, saving: false, error: errorMessage(error) })),
      )
  }
  return {
    get: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    open(path: string) {
      update((current) => ({
        ...current,
        active: path,
        tabs: current.tabs.some((file) => file.path === path)
          ? current.tabs
          : [...current.tabs, opening(path)],
      }))
    },
    edit(id: number, text: string) {
      patch(id, (file) => ({ ...file, text }))
      schedule(id)
    },
    // A discard decision must stop the pending timer, not just the UI controls (#2840).
    pause(id: number) {
      const file = state.tabs.find((item) => item.id === id)
      if (!file || file.saving) return false
      paused.add(id)
      cancel(id)
      return true
    },
    resume(id: number) {
      paused.delete(id)
      schedule(id)
    },
    close(path: string) {
      const closing = state.tabs.find((item) => item.path === path)
      if (!closing || closing.saving) return false
      cancel(closing.id)
      paused.delete(closing.id)
      update((current) => {
        const index = current.tabs.findIndex((file) => file.path === path)
        const tabs = current.tabs.filter((file) => file.path !== path)
        return {
          ...current,
          tabs,
          active:
            current.active === path
              ? (tabs[Math.min(index, tabs.length - 1)]?.path ?? null)
              : current.active,
        }
      })
      return true
    },
    reload(path: string) {
      const reloading = state.tabs.find((item) => item.path === path)
      if (!reloading || reloading.saving) return false
      cancel(reloading.id)
      paused.delete(reloading.id)
      update((current) => ({
        ...current,
        tabs: current.tabs.map((file) => (file.path === path ? opening(path) : file)),
      }))
      return true
    },
    load(tabs: FileBuffer[]) {
      for (const file of tabs) {
        if (!file.loading || requests.has(file.id)) continue
        requests.add(file.id)
        void api
          .action(Read, { path: file.path })
          .then((result) => patch(file.id, (current) => loaded(current, result)))
          .catch((error: unknown) =>
            patch(file.id, (current) => ({
              ...current,
              loading: false,
              error: errorMessage(error),
            })),
          )
          .finally(() => requests.delete(file.id))
      }
    },
    save,
    retry(id: number) {
      patch(id, (file) => ({ ...file, error: undefined }))
      save(id)
    },
  }
}

function session(root: string) {
  if (!sessions.size) {
    // Files may unmount on a surface switch while drafts or a save are still live (#2840).
    window.addEventListener('beforeunload', (event) => {
      if ([...sessions.values()].some((item) => item.get().tabs.some(dirty))) {
        event.preventDefault()
        event.returnValue = ''
      }
    })
  }
  let value = sessions.get(root)
  if (!value) {
    value = createSession(root)
    sessions.set(root, value)
  }
  return value
}

export function useFiles(root: string) {
  const files = session(root)
  const [state, setState] = createSignal(files.get())

  onSettled(() => files.subscribe(() => setState(files.get())))

  // The session survives view switches. Its timers and asynchronous writes
  // are server-backed and must not be destroyed on surface unmount.
  createEffect(() => state().tabs, (tabs) => {
    files.load(tabs)
  })

  return { state, ...files }
}
