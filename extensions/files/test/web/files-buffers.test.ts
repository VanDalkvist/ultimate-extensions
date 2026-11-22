import { expect, it } from 'vitest'
import {
  beginSave,
  dirty,
  loaded,
  opening,
  restore,
  saved,
  snapshot,
} from '../../buffers.ts'

it('recovers a tab-local draft and only acknowledges the text actually saved', () => {
  const read = { path: 'README.md', secretText: '# Original', version: 'v1', bytes: 10 }
  const clean = loaded(opening(read.path), read)
  expect(dirty(clean)).toBe(false)
  const edited = { ...clean, text: '# Edited' }
  const stored = snapshot({ tabs: [edited], active: edited.path })
  const recovered = restore(stored)
  expect(recovered.active).toBe('README.md')
  expect(recovered.tabs[0]).toMatchObject({
    text: '# Edited',
    version: 'v1',
    restored: true,
    loading: false,
  })
  expect(dirty(recovered.tabs[0])).toBe(true)

  const newer = { ...recovered.tabs[0], text: '# Typed during save', saving: true }
  const result = saved(newer, '# Edited', { status: 'saved', version: 'v2', bytes: 8 })
  expect(result).toMatchObject({
    text: '# Typed during save',
    base: '# Edited',
    version: 'v2',
    saving: false,
  })
  expect(dirty(result)).toBe(true)
  expect(saved(result, result.text, { status: 'conflict' })).toMatchObject({
    text: result.text,
    conflict: true,
  })

  const complete = saved(result, result.text, { status: 'saved', version: 'v3', bytes: 19 })
  expect(dirty(complete)).toBe(false)
  const cleanSnapshot = snapshot({ tabs: [complete], active: complete.path })
  expect(cleanSnapshot).not.toContain('Typed during save')
  expect(restore(cleanSnapshot).tabs[0]).toMatchObject({ path: 'README.md', loading: true })
})

it('keeps a reverted draft across reload before a save response arrives', () => {
  const original = loaded(opening('notes.md'), {
    path: 'notes.md',
    secretText: 'A',
    version: 'v1',
    bytes: 1,
  })
  const pending = beginSave({ ...original, text: 'B' })
  const reverted = { ...pending, text: 'A' }
  expect(dirty(reverted)).toBe(true)

  // The disk may already contain B while this tab still knows only the old version v1.
  const recovered = restore(snapshot({ tabs: [reverted], active: reverted.path })).tabs[0]
  expect(recovered).toMatchObject({
    text: 'A',
    base: 'A',
    version: 'v1',
    saving: false,
    unconfirmed: true,
  })
  expect(dirty(recovered)).toBe(true)
  expect(restore(snapshot({ tabs: [recovered], active: recovered.path })).tabs[0].text).toBe('A')

  const conflict = saved(recovered, 'A', { status: 'conflict' })
  expect(dirty(conflict)).toBe(true)
  expect(restore(snapshot({ tabs: [conflict], active: conflict.path })).tabs[0].text).toBe('A')

  const acknowledged = saved(reverted, 'B', { status: 'saved', version: 'v2', bytes: 1 })
  expect(acknowledged).toMatchObject({ text: 'A', base: 'B', unconfirmed: false })
  expect(dirty(acknowledged)).toBe(true)
})
