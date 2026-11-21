export type Side = 'left' | 'right'
type Bounds = { min: number; max: number }

const composer = '#app > .safe-area > div > div > main:has(> [data-ui="conversation"])'
const leftAside =
  'aside.flex.shrink-0.flex-col.border-r.w-72.overflow-y-auto.border-sidebar-border.bg-sidebar.text-sidebar-foreground'
const rightAside = 'aside.flex.shrink-0.flex-col.border-l.bg-sidebar[class~="w-[22rem]"]'

export function findPanels(document: Document) {
  const centers = document.querySelectorAll<HTMLElement>(composer)
  const main = centers.length === 1 ? centers[0] : undefined
  const left = main?.previousElementSibling as HTMLElement | undefined
  const right = main?.nextElementSibling as HTMLElement | undefined
  return {
    mounted: centers.length > 0,
    left: !left?.previousElementSibling && left?.matches(leftAside) ? left : undefined,
    right: !right?.nextElementSibling && right?.matches(rightAside) ? right : undefined,
  }
}

export function panelBounds(
  span: number,
  side: Side,
  width: number,
  peer: number | undefined,
): Bounds {
  const room = Math.max(0, Math.floor(span - 360))
  const left = side === 'left' ? width : peer
  const right = side === 'right' ? width : peer
  const leftMin = left === undefined ? 0 : Math.min(200, room)
  const rightMin = right === undefined ? 0 : Math.min(280, room - leftMin)
  const leftFit = left === undefined ? 0 : clampWidth(left, { min: leftMin, max: room - rightMin })
  const rightFit =
    right === undefined ? 0 : clampWidth(right, { min: rightMin, max: room - leftFit })
  return side === 'left'
    ? { min: leftMin, max: room - rightFit }
    : { min: rightMin, max: room - leftFit }
}

export function clampWidth(width: number, { min, max }: Bounds) {
  return Math.min(max, Math.max(min, Math.round(width)))
}

export function keyboardWidth(
  key: string,
  width: number,
  step: number,
  bounds: Bounds,
  side: Side,
) {
  const direction = side === 'left' ? 1 : -1
  switch (key) {
    case 'ArrowLeft':
      return clampWidth(width - step * direction, bounds)
    case 'ArrowRight':
      return clampWidth(width + step * direction, bounds)
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
