/** @jsxImportSource @solidjs/web */
import {
  defineWebExtension,
  notify,
  useConversationId,
  useExtensionUiState,
  usePanels,
  useRegionOpen,
  useSurface,
  useViewport,
  writingAs,
} from '@/sdk/solid'
import { definePrimitive } from '@ui-sdk/core'
import { createParts } from '@ui-sdk/solid/primitive'
import { Show, createEffect, createSignal, onSettled } from 'solid-js'
import { findPanels, type Side } from './panel.ts'
import { connectResize, preferredWidth, type Choice } from './resize.ts'

type Target = { panel: HTMLElement; defaultWidth: number }
const sides = ['left', 'right'] as const

const separator = definePrimitive({
  name: 'right-panel-resize',
  options: { onSetValue: 'callback' },
  state: (_: { onSetValue: (width: number) => void }) => ({}),
  api: (ctx) => ({
    setValue(width: number) {
      if (!Number.isFinite(width))
        throw new TypeError('Panel width must be a finite number of pixels')
      ctx.options().onSetValue(width)
    },
  }),
  agent: { actions: ['setValue'] },
  slots: (slot) => ({
    root: slot({
      role: 'separator',
      attrs: () => ({ tabindex: '0', 'aria-orientation': 'vertical' }),
    }),
  }),
})
const { Root: Separator } = createParts(separator, { root: 'div' })

function Handle(props: {
  side: Side
  target: Target
  context: () => string
  width: () => Choice
  peer: () => number | undefined
  save: (width: Choice) => void
}) {
  let handle!: HTMLDivElement
  let resize: ReturnType<typeof connectResize> | undefined
  const label = () => (props.side === 'left' ? 'Resize left sidebar' : 'Resize right panel')
  createEffect(
    () => ({ width: props.width(), peer: props.peer(), context: props.context() }),
    ({ width, peer, context }) => {
      const { panel, defaultWidth } = props.target
      resize ??= connectResize(handle, panel, props.side, defaultWidth, props.save)
      resize.update(width, peer, context)
    },
  )
  onSettled(() => () => resize?.dispose())
  return (
    <Separator
      aria-label={label()}
      title={`${label()} · Double-click to reset`}
      data-right-panel-resize={props.side === 'right' ? '' : undefined}
      data-left-panel-resize={props.side === 'left' ? '' : undefined}
      class="fixed z-20 w-2 -translate-x-1/2 cursor-col-resize touch-none select-none hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline focus-visible:outline-ring data-dragging:bg-accent/60"
      style={{ visibility: 'hidden' }}
      ref={(element) => {
        handle = element
      }}
      onSetValue={(width) => writingAs('agent', () => resize?.setPixels(width))}
    />
  )
}

function Overlay() {
  const bindings = {
    left: useExtensionUiState<Choice>('leftWidth', null),
    right: useExtensionUiState<Choice>('width', null),
  }
  const { active, open } = usePanels()
  const sidebarOpen = useRegionOpen('sidebar')
  const surface = useSurface()
  const viewport = useViewport()
  const conversation = useConversationId()
  const context = () => `${conversation()}:${active()?.id}`
  const [targets, setTargets] = createSignal<Partial<Record<Side, Target>>>({})
  const warned = new Set<Side>()
  let current: Partial<Record<Side, Target>> = {}
  createEffect(
    () => {
      if (surface() !== 'agent' || viewport() !== 'desktop' || conversation() === undefined)
        return 0
      return Number(sidebarOpen()) + (open() && active() ? 2 : 0)
    },
    (enabled) => {
      if (!enabled) {
        current = {}
        warned.clear()
        setTargets(current)
        return
      }
      function sync() {
        const found = findPanels(document)
        const next: Partial<Record<Side, Target>> = {}
        for (const [index, side] of sides.entries()) {
          const expected = (enabled & (1 << index)) !== 0
          const panel = expected ? found[side] : undefined
          const previous = current[side]
          if (panel)
            next[side] =
              previous?.panel === panel
                ? previous
                : { panel, defaultWidth: panel.getBoundingClientRect().width }
          if (panel || !expected || !found.mounted) warned.delete(side)
          else if (!warned.has(side)) {
            warned.add(side)
            const region = side === 'left' ? 'left sidebar' : 'right panel'
            notify({
              level: 'warning',
              message: `Resize: the desktop ${region} was not recognized. It was left unchanged.`,
            })
          }
        }
        if (next.left !== current.left || next.right !== current.right) {
          current = next
          setTargets(next)
        }
      }
      const observer = new MutationObserver((records) => {
        const panel = current.left?.panel ?? current.right?.panel
        const shell = panel?.parentElement
        if (
          !shell ||
          records.some(
            ({ target }) =>
              target.parentNode === shell || target === shell || !shell.contains(target),
          )
        )
          sync()
      })
      observer.observe(document.getElementById('app') ?? document.body, {
        childList: true,
        subtree: true,
      })
      sync()
      return () => observer.disconnect()
    },
  )
  function handle(side: Side) {
    const other = side === 'left' ? 'right' : 'left'
    const [width, save] = bindings[side]
    const peer = () => {
      const target = targets()[other]
      return target ? preferredWidth(bindings[other][0](), target.defaultWidth) : undefined
    }
    return (
      <Show when={targets()[side]} keyed>
        {(target) => (
          <Handle
            side={side}
            target={target}
            context={context}
            width={width}
            peer={peer}
            save={save}
          />
        )}
      </Show>
    )
  }
  return (
    <>
      {handle('left')}
      {handle('right')}
    </>
  )
}

export { Overlay }
export default defineWebExtension({ slots: { overlay: Overlay } })
