import { clampWidth, keyboardWidth, ownInlineWidth, panelBounds, type Side } from './panel.ts'

export type Choice = number | null

export function preferredWidth(choice: Choice, fallback: number) {
  return typeof choice === 'number' && Number.isFinite(choice) ? choice : fallback
}

export function connectResize(
  handle: HTMLElement,
  panel: HTMLElement,
  side: Side,
  defaultWidth: number,
  save: (width: Choice) => void,
) {
  const document = handle.ownerDocument
  const window = document.defaultView!
  const listeners = new window.AbortController()
  const inlineWidth = ownInlineWidth(panel)
  const shell = panel.parentElement!
  const center = (side === 'left' ? panel.nextElementSibling : panel.previousElementSibling)!
  const direction = side === 'left' ? 1 : -1
  let rect = panel.getBoundingClientRect()
  let span = 0
  let desired: Choice = null
  let peer: number | undefined
  let visibleWidth = defaultWidth
  let bounds = panelBounds(span, side, defaultWidth, peer)
  let context: string | undefined
  let drag: { id: number; from: number; x: number; live: number; end: () => void } | undefined

  function draw() {
    const preferred = preferredWidth(desired, defaultWidth)
    bounds = panelBounds(span, side, preferred, peer)
    visibleWidth = clampWidth(drag?.live ?? preferred, bounds)
    inlineWidth.set(
      !drag && desired === null && visibleWidth === Math.round(defaultWidth) ? null : visibleWidth,
    )
    const outerEdge = side === 'left' ? rect.left : rect.right
    handle.style.left = `${outerEdge + direction * visibleWidth}px`
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
      if (!(error instanceof window.DOMException && error.name === 'NotFoundError')) throw error
      return
    }
    event.preventDefault()
    const session = new window.AbortController()
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
      gesture.live = gesture.from + direction * (next.clientX - gesture.x)
      draw()
    }
    function finish(next: PointerEvent) {
      if (next.pointerId !== gesture.id) return
      if (next.pointerType !== 'mouse' || next.button === 0) move(next)
      const width = visibleWidth
      if (width === gesture.from) gesture.end()
      else choose(width)
    }
    handle.addEventListener(
      'pointermove',
      (next) => {
        if (next.pointerId !== gesture.id) return
        if (next.pointerType === 'mouse' && (next.buttons & 1) === 0) finish(next)
        else move(next)
      },
      options,
    )
    handle.addEventListener('pointerup', finish, options)
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
  }

  handle.addEventListener('pointerdown', start, { signal: listeners.signal })
  handle.addEventListener('dblclick', () => choose(null), { signal: listeners.signal })
  handle.addEventListener(
    'keydown',
    (event) => {
      if (drag || event.altKey || event.ctrlKey || event.metaKey) return
      const next = keyboardWidth(event.key, visibleWidth, event.shiftKey ? 64 : 16, bounds, side)
      if (next === undefined) return
      event.preventDefault()
      event.stopPropagation()
      if (next !== visibleWidth) choose(next)
    },
    { signal: listeners.signal },
  )

  function measure() {
    rect = panel.getBoundingClientRect()
    const shellRect = shell.getBoundingClientRect()
    if (peer !== undefined) span = shellRect.width
    else {
      const centralRect = center.getBoundingClientRect()
      span =
        side === 'left' ? centralRect.right - shellRect.left : shellRect.right - centralRect.left
    }
    draw()
  }
  const size = new window.ResizeObserver(measure)
  size.observe(shell)

  return {
    setPixels(width: number) {
      choose(clampWidth(width, bounds))
    },
    update(width: Choice, opposite: number | undefined, nextContext: string) {
      if (context !== nextContext) drag?.end()
      context = nextContext
      desired = width
      peer = opposite
      measure()
    },
    dispose() {
      listeners.abort()
      size.disconnect()
      drag?.end()
      inlineWidth.restore()
    },
  }
}
