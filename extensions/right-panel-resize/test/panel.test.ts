import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import test from 'node:test'
import { clampWidth, findPanels, keyboardWidth, ownInlineWidth, panelBounds } from '../panel.ts'
import { connectResize } from '../resize.ts'

const requireFromHost = createRequire(
  resolve(process.env.ULTIMATE_CLONE ?? '../ultimate', 'package.json'),
)
const { JSDOM } = requireFromHost('jsdom')
const desktop = `<aside id="right" class="flex w-[22rem] shrink-0 flex-col border-l border-border/70 bg-sidebar">
  <div class="flex h-10 shrink-0 items-center border-b"></div>
  <div class="min-h-0 flex-1 overflow-y-auto"><iframe></iframe></div>
</aside>`
const center = `<main><div data-ui="conversation"></div></main>`
const left = `<aside id="left" class="flex shrink-0 flex-col border-r w-72 overflow-y-auto border-sidebar-border bg-sidebar text-sidebar-foreground"></aside>`
const dock = `<aside class="relative flex shrink-0 flex-col border-l" style="width:416px"></aside>`

function shell(content: string) {
  return new JSDOM(`<div id="app"><div class="safe-area"><div>${content}</div></div></div>`).window
    .document as Document
}

test('binds only docked shell asides beside the Agent composer', () => {
  const document = shell(`<div>${left}${center}${desktop}</div><div>${dock}</div>`)
  const match = findPanels(document)
  assert.equal(match.left, document.getElementById('left'))
  assert.equal(match.right, document.getElementById('right'))
  assert.equal(findPanels(shell(`<div>${dock}${left}${center}</div>`)).left, undefined)
  assert.equal(
    findPanels(shell(`<div><div role="dialog">${left}</div>${center}</div>`)).left,
    undefined,
  )
})

test('startup without the composer is not a mounted host contract mismatch', () => {
  assert.equal(findPanels(shell('<div><main></main></div>')).mounted, false)
  assert.deepEqual(findPanels(shell(`<div>${dock}${center}${dock}</div>`)), {
    mounted: true,
    left: undefined,
    right: undefined,
  })
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
    assert.equal(findPanels(shell(content)).right, undefined, content)
})

test('fits the panel beside a 360px composer and preserves room even with a short span', () => {
  const fit = (span: number, width: number) =>
    clampWidth(width, panelBounds(span, 'right', width, undefined))
  assert.equal(fit(736, 700), 376)
  assert.equal(fit(1152, 700), 700)
  assert.equal(fit(736, 100), 280)
  assert.equal(fit(570, 352), 210)
  assert.equal(fit(350, 352), 0)
})

test('both saved widths share a deterministic budget and recover when there is room', () => {
  const fit = (span: number) => [
    clampWidth(500, panelBounds(span, 'left', 500, 600)),
    clampWidth(600, panelBounds(span, 'right', 600, 500)),
  ]
  assert.deepEqual(fit(1000), [360, 280])
  assert.deepEqual(fit(1200), [500, 340])
  assert.deepEqual(fit(1460), [500, 600])
  assert.equal(panelBounds(1200, 'left', 288, 352).max, 488)
  assert.equal(panelBounds(1200, 'right', 352, 288).max, 552)
})

test('separator arrows move the physical edge; Home, End and Enter reach limits/reset', () => {
  const bounds = panelBounds(900, 'right', 352, undefined)
  const right = (key: string, step = 16) => keyboardWidth(key, 352, step, bounds, 'right')
  assert.equal(right('ArrowLeft'), 368)
  assert.equal(right('ArrowRight', 64), 288)
  assert.equal(right('Home'), 280)
  assert.equal(right('End'), 540)
  assert.equal(right('Enter'), null)
  assert.equal(right('Tab'), undefined)
  const leftBounds = panelBounds(900, 'left', 288, undefined)
  assert.equal(keyboardWidth('ArrowLeft', 288, 16, leftBounds, 'left'), 272)
  assert.equal(keyboardWidth('ArrowRight', 288, 16, leftBounds, 'left'), 304)
})

test('only changes panel width and restores the original declaration and its priority', () => {
  const panel = findPanels(shell(`<div>${center}${desktop}</div>`)).right!
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
  const panel = findPanels(shell(`<div>${center}${desktop}</div>`)).right!
  const width = ownInlineWidth(panel)
  width.set(500)
  width.set(null)
  assert.equal(panel.style.width, '')
  width.set(510)
  panel.style.width = '480px'
  width.restore()
  assert.equal(panel.style.width, '480px')
})

function gestureFixture() {
  const document = shell(`<div>${center}${desktop}</div>`)
  const window = document.defaultView!
  Object.defineProperty(window, 'ResizeObserver', {
    value: class {
      observe() {}
      disconnect() {}
    },
  })
  const panel = findPanels(document).right!
  panel.getBoundingClientRect = () => new window.DOMRect(648, 0, 352, 800)
  panel.parentElement!.getBoundingClientRect = () => new window.DOMRect(0, 0, 1000, 800)
  const handle = document.createElement('div')
  document.body.append(handle)
  let captured = false
  handle.setPointerCapture = () => {
    captured = true
  }
  handle.hasPointerCapture = () => captured
  handle.releasePointerCapture = () => {
    captured = false
  }
  const saved: (number | null)[] = []
  const resize = connectResize(handle, panel, 'right', 352, (width) => saved.push(width))
  resize.update(null, undefined, 'agent')
  function pointer(type: string, clientX: number, button: number, buttons: number) {
    handle.dispatchEvent(
      new window.PointerEvent(type, {
        clientX,
        button,
        buttons,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
      }),
    )
  }
  function shield() {
    return document.querySelector('[data-right-panel-resize-shield]')
  }
  return { window, panel, handle, pointer, shield, saved, resize }
}

test('releasing primary while secondary remains held commits immediately and ignores secondary movement', (t) => {
  const { panel, pointer, shield, saved, resize } = gestureFixture()
  t.after(resize.dispose)
  pointer('pointerdown', 648, 0, 1)
  pointer('pointermove', 598, -1, 1)
  pointer('pointermove', 588, 2, 3)
  assert.deepEqual(saved, [])
  pointer('pointermove', 588, 0, 2)
  assert.equal(shield(), null)
  assert.deepEqual(saved, [412])
  pointer('pointermove', 488, -1, 2)
  pointer('pointerup', 488, 2, 0)
  assert.equal(panel.style.width, '412px')
  assert.deepEqual(saved, [412])
})

test('Escape remains the host shortcut and does not also cancel resizing', (t) => {
  const { window, panel, handle, pointer, shield, saved, resize } = gestureFixture()
  t.after(resize.dispose)
  let hostEscape = 0
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') hostEscape++
    },
    true,
  )
  pointer('pointerdown', 648, 0, 1)
  pointer('pointermove', 598, -1, 1)
  const escape = new window.KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  })
  handle.dispatchEvent(escape)
  assert.equal(hostEscape, 1)
  assert.equal(escape.defaultPrevented, false)
  assert.ok(shield())
  assert.equal(panel.style.width, '402px')
  assert.deepEqual(saved, [])
  window.dispatchEvent(new window.Event('blur'))
  assert.equal(shield(), null)
  assert.equal(panel.style.width, '')
})
