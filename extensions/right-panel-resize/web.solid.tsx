/** @jsxImportSource @solidjs/web */
import {
  defineWebExtension,
  notify,
  useConversationId,
  useExtensionUiState,
  usePanels,
  useSurface,
  useViewport,
  writingAs,
} from '@/sdk/solid'
import { definePrimitive } from '@ui-sdk/core'
import { createParts } from '@ui-sdk/solid/primitive'
import { Show, createEffect, createSignal, onSettled } from 'solid-js'
import { findPanel } from './panel.ts'
import { connectResize } from './resize.ts'

type Choice = number | null
type Target = { main: HTMLElement; panel: HTMLElement }

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
  target: Target
  context: () => string
  width: () => Choice
  save: (width: Choice) => void
}) {
  let handle!: HTMLDivElement
  let resize: ReturnType<typeof connectResize> | undefined
  createEffect(
    () => ({ width: props.width(), context: props.context() }),
    ({ width, context }) => {
      resize ??= connectResize(handle, props.target.main, props.target.panel, props.save)
      resize.update(width, context)
    },
  )
  onSettled(() => () => resize?.dispose())
  return (
    <Separator
      aria-label="Resize right panel"
      title="Resize right panel · Double-click to reset"
      data-right-panel-resize=""
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
  const [stored, setStored] = useExtensionUiState<Choice>('width', null)
  const { active, open } = usePanels()
  const surface = useSurface()
  const viewport = useViewport()
  const conversation = useConversationId()
  const [target, setTarget] = createSignal<Target>()
  createEffect(
    () =>
      surface() === 'agent' &&
      viewport() === 'desktop' &&
      open() &&
      !!active() &&
      conversation() !== undefined,
    (enabled) => {
      if (!enabled) {
        setTarget(undefined)
        return
      }
      let current: Target | undefined
      let warned = false
      function sync() {
        const { main, panel } = findPanel(document)
        if (main === current?.main && panel === current?.panel && current) return
        current = main && panel ? { main, panel } : undefined
        setTarget(current)
        if (current) warned = false
        else if (!warned) {
          warned = true
          notify({
            level: 'warning',
            message:
              'Right panel resize: the desktop panel was not recognized. No panel was changed.',
          })
        }
      }
      const observer = new MutationObserver((records) => {
        if (
          !current ||
          records.some(({ target }) => {
            const { main, panel } = current!
            return (
              target === main ||
              target === panel ||
              (!main.contains(target) && !panel.contains(target))
            )
          })
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
  return (
    <Show when={target()} keyed>
      {(panel) => (
        <Handle
          target={panel}
          context={() => `${conversation()}:${active()?.id}`}
          width={stored}
          save={setStored}
        />
      )}
    </Show>
  )
}

export default defineWebExtension({ slots: { overlay: Overlay } })
