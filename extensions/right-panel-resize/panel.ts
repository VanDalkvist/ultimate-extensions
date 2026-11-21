const composer = '#app > .safe-area > div > div > main:has(> [data-ui="conversation"])'
const desktopAside = 'aside.flex.shrink-0.flex-col.border-l.bg-sidebar[class~="w-[22rem]"]'

export function findPanel(document: Document) {
  const centers = document.querySelectorAll<HTMLElement>(composer)
  const main = centers.length === 1 ? centers[0] : undefined
  const panel = main?.nextElementSibling as HTMLElement | undefined
  if (
    !main ||
    !panel?.matches(desktopAside) ||
    panel.nextElementSibling ||
    !panel.children[0]?.matches('div.h-10.shrink-0.border-b') ||
    !panel.children[1]?.matches('div.flex-1.overflow-y-auto')
  )
    return { main, panel: undefined }
  return { main, panel }
}

export function panelBounds(span: number) {
  const max = Math.max(0, Math.floor(span - 360))
  return { min: Math.min(280, max), max }
}

export function clampWidth(width: number, { min, max }: ReturnType<typeof panelBounds>) {
  return Math.min(max, Math.max(min, Math.round(width)))
}

export function keyboardWidth(
  key: string,
  width: number,
  step: number,
  bounds: ReturnType<typeof panelBounds>,
) {
  switch (key) {
    case 'ArrowLeft':
      return clampWidth(width + step, bounds)
    case 'ArrowRight':
      return clampWidth(width - step, bounds)
    case 'Home':
      return bounds.min
    case 'End':
      return bounds.max
    case 'Enter':
      return null
    default:
      return undefined
  }
}

export function ownInlineWidth(panel: HTMLElement) {
  const { style } = panel
  const original = style.getPropertyValue('width')
  const priority = style.getPropertyPriority('width')
  let last: string | undefined
  function restore() {
    if (
      last !== undefined &&
      style.getPropertyValue('width') === last &&
      style.getPropertyPriority('width') === ''
    ) {
      if (original) style.setProperty('width', original, priority)
      else style.removeProperty('width')
    }
    last = undefined
  }
  return {
    set(width: number | null) {
      if (width === null) return restore()
      const next = `${width}px`
      if (next === last) return
      style.setProperty('width', next)
      last = next
    },
    restore,
  }
}
