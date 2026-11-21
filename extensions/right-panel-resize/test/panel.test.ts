import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import test from 'node:test'
import { clampWidth, findPanel, keyboardWidth, ownInlineWidth, panelBounds } from '../panel.ts'

const requireFromHost = createRequire(
  resolve(process.env.ULTIMATE_CLONE ?? '../ultimate', 'package.json'),
)
const { JSDOM } = requireFromHost('jsdom')
const desktop = `<aside id="right" class="flex w-[22rem] shrink-0 flex-col border-l border-border/70 bg-sidebar">
  <div class="flex h-10 shrink-0 items-center border-b"></div>
  <div class="min-h-0 flex-1 overflow-y-auto"><iframe></iframe></div>
</aside>`
const center = `<main><div data-ui="conversation"></div></main>`
const left = `<aside class="flex w-72 shrink-0 border-r bg-sidebar"></aside>`
const dock = `<aside class="relative flex shrink-0 flex-col border-l" style="width:416px"></aside>`

function shell(content: string) {
  return new JSDOM(`<div id="app"><div class="safe-area"><div>${content}</div></div></div>`).window
    .document as Document
}

test('binds only the terminal desktop aside next to the Agent composer', () => {
  const document = shell(`<div>${left}${center}${desktop}</div><div>${dock}</div>`)
  const match = findPanel(document)
  assert.equal(match.panel, document.getElementById('right'))
  assert.equal(match.main, document.querySelector('main'))
})

test('rejects a conversation dock, a narrow overlay, and ambiguous or changed host markup', () => {
  for (const content of [
    `<div>${left}${center}${dock}</div>`,
    `<div>${left}${center}<div role="dialog">${desktop}</div></div>`,
    `<div>${center}${desktop}${dock}</div>`,
    `<div>${center}${desktop}</div><div>${center}${dock}</div>`,
    `<div>${center}${desktop.replace('overflow-y-auto', 'overflow-auto')}</div>`,
    `<div><main></main>${desktop}</div>`,
  ])
    assert.equal(findPanel(shell(content)).panel, undefined, content)
})

test('fits the panel beside a 360px composer and preserves room even with a short span', () => {
  const desired = 700
  assert.equal(clampWidth(desired, panelBounds(736)), 376)
  assert.equal(clampWidth(desired, panelBounds(1152)), 700)
  assert.equal(clampWidth(100, panelBounds(736)), 280)
  assert.equal(clampWidth(352, panelBounds(570)), 210)
  assert.equal(clampWidth(352, panelBounds(350)), 0)
})

test('separator arrows follow the moving left edge and Home, End, Enter reach their limits/reset', () => {
  const bounds = panelBounds(900)
  assert.equal(keyboardWidth('ArrowLeft', 352, 16, bounds), 368)
  assert.equal(keyboardWidth('ArrowRight', 352, 64, bounds), 288)
  assert.equal(keyboardWidth('Home', 352, 16, bounds), 280)
  assert.equal(keyboardWidth('End', 352, 16, bounds), 540)
  assert.equal(keyboardWidth('Enter', 352, 16, bounds), null)
  assert.equal(keyboardWidth('Tab', 352, 16, bounds), undefined)
})

test('only changes panel width and restores the original declaration and its priority', () => {
  const panel = findPanel(shell(`<div>${center}${desktop}</div>`)).panel!
  panel.style.cssText = 'width: 22rem !important; background: red;'
  const width = ownInlineWidth(panel)
  width.set(540)
  assert.equal(panel.style.width, '540px')
  assert.equal(panel.style.getPropertyPriority('width'), '')
  assert.equal(panel.style.background, 'red')
  width.restore()
  assert.equal(panel.style.width, '22rem')
  assert.equal(panel.style.getPropertyPriority('width'), 'important')
  assert.equal(panel.style.background, 'red')
})

test('reset removes extension-owned width and cleanup respects a later foreign inline write', () => {
  const panel = findPanel(shell(`<div>${center}${desktop}</div>`)).panel!
  const width = ownInlineWidth(panel)
  width.set(500)
  width.set(null)
  assert.equal(panel.style.width, '')
  width.set(510)
  panel.style.width = '480px'
  width.restore()
  assert.equal(panel.style.width, '480px')
})
