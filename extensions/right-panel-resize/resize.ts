import { clampWidth, keyboardWidth, ownInlineWidth, panelBounds } from './panel.ts'

type Choice = number | null

export function connectResize(
  handle: HTMLElement,
  main: HTMLElement,
  panel: HTMLElement,
  save: (width: Choice) => void,
) {
  const document = handle.ownerDocument
  const window = document.defaultView!
  const listeners = new AbortController()
  const inlineWidth = ownInlineWidth(panel)
  let rect = panel.getBoundingClientRect()
  const defaultWidth = rect.width
  let desired: Choice = null
  let visibleWidth = defaultWidth
  let bounds = panelBounds(rect.right - main.getBoundingClientRect().left)
  let context: string | undefined
  let drag: { id: number; from: number; x: number; live: number; end: () => void } | undefined

  function draw() {
    visibleWidth = clampWidth(drag?.live ?? desired ?? defaultWidth, bounds)
    inlineWidth.set(
      !drag && desired === null && visibleWidth === Math.round(defaultWidth) ? null : visibleWidth,
    )
    handle.style.left = `${rect.right - visibleWidth}px`
    handle.style.top = `${rect.top}px`
    handle.style.height = `${rect.height}px`
    handle.style.visibility = rect.height > 0 && bounds.max > bounds.min ? 'visible' : 'hidden'
    handle.setAttribute('aria-valuemin', String(bounds.min))
    handle.setAttribute('aria-valuemax', String(bounds.max))
    handle.setAttribute('aria-valuenow', String(visibleWidth))
    handle.setAttribute('aria-valuetext', `${visibleWidth} pixels`)
  }

  function choose(width: Choice) {
    drag?.end()
    if (width === desired) return
    desired = width
    draw()
    save(width)
  }

  function start(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0 || drag) return
    try {
      handle.setPointerCapture(event.pointerId)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error
      return
    }
    event.preventDefault()
    const session = new AbortController()
    const options = { signal: session.signal }
    const shield = document.createElement('div')
    shield.className = 'fixed inset-0 z-[2147483647] cursor-col-resize touch-none select-none'
    shield.setAttribute('aria-hidden', 'true')
    shield.dataset.rightPanelResizeShield = ''
    const gesture = {
      id: event.pointerId,
      from: visibleWidth,
      x: event.clientX,
      live: visibleWidth,
      end() {
        drag = undefined
        session.abort()
        shield.remove()
        delete handle.dataset.dragging
        if (handle.hasPointerCapture(gesture.id)) handle.releasePointerCapture(gesture.id)
        draw()
      },
    }
    drag = gesture
    handle.dataset.dragging = ''
    document.body.append(shield)

    function move(next: PointerEvent) {
      if (next.pointerId !== gesture.id) return
      gesture.live = gesture.from + gesture.x - next.clientX
      draw()
    }
    handle.addEventListener('pointermove', move, options)
    handle.addEventListener(
      'pointerup',
      (next) => {
        if (next.pointerId !== gesture.id) return
        move(next)
        const width = visibleWidth
        if (width === gesture.from) gesture.end()
        else choose(width)
      },
      options,
    )
    for (const eventName of ['pointercancel', 'lostpointercapture'] as const) {
      handle.addEventListener(
        eventName,
        (next) => {
          if (next.pointerId === gesture.id) gesture.end()
        },
        options,
      )
    }
    window.addEventListener('blur', gesture.end, options)
    window.addEventListener(
      'keydown',
      (key) => {
        if (key.key !== 'Escape') return
        key.preventDefault()
        key.stopPropagation()
        gesture.end()
      },
      { ...options, capture: true },
    )
  }

  handle.addEventListener('pointerdown', start, { signal: listeners.signal })
  handle.addEventListener('dblclick', () => choose(null), { signal: listeners.signal })
  handle.addEventListener(
    'keydown',
    (event) => {
      if (drag || event.altKey || event.ctrlKey || event.metaKey) return
      const next = keyboardWidth(event.key, visibleWidth, event.shiftKey ? 64 : 16, bounds)
      if (next === undefined) return
      event.preventDefault()
      event.stopPropagation()
      if (next !== visibleWidth) choose(next)
    },
    { signal: listeners.signal },
  )

  const size = new ResizeObserver(() => {
    rect = panel.getBoundingClientRect()
    bounds = panelBounds(rect.right - main.getBoundingClientRect().left)
    draw()
  })
  size.observe(main)
  size.observe(panel)
  size.observe(panel.parentElement!)

  return {
    setPixels(width: number) {
      choose(clampWidth(width, bounds))
    },
    update(width: Choice, nextContext: string) {
      if (context !== nextContext) drag?.end()
      context = nextContext
      desired = typeof width === 'number' && Number.isFinite(width) ? width : null
      draw()
    },
    dispose() {
      listeners.abort()
      size.disconnect()
      drag?.end()
      inlineWidth.restore()
    },
  }
}
