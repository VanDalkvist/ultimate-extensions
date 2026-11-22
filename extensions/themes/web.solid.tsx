import { For, Show, createSignal } from 'solid-js'
import { Button } from '@/components/ui/button.solid.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog.solid.tsx'
import {
  ROOT,
  actionRef,
  api,
  defineWebExtension,
  docRef,
  errorMessage,
  useDialog,
  useDocOf,
} from '@/sdk/solid'
import { defaultTheme, findTheme, selectionKind, themeCss, themes } from './registry.ts'

const picker = 'themes.picker'
const ThemeDoc = docRef<{ id: string }>(selectionKind)
const ApplyAction = actionRef<{ id: string }, { id: string }>('themes', 'apply')

function Themes() {
  const selection = useDocOf(() => ROOT, ThemeDoc)
  const current = () => findTheme(selection()?.id)?.id ?? defaultTheme
  const css = () => themeCss(current())
  const [open, setOpen] = useDialog(picker)
  const [pending, setPending] = createSignal(false)
  const [failure, setFailure] = createSignal('')

  async function choose(id: string) {
    setPending(true)
    setFailure('')
    try {
      await api.action(ApplyAction, { id })
      setOpen(false)
    } catch (error) {
      setFailure(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Show when={css()}>
        <style id="ultimate-project-theme">{css()}</style>
      </Show>
      <Dialog open={open()} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Choose a color theme</DialogTitle>
          <DialogDescription>The palette follows Ultimate’s light or dark mode.</DialogDescription>
          <div class="flex flex-wrap gap-2">
            <For each={themes}>
              {(theme) => (
                <Button
                  variant={theme.id === current() ? 'default' : 'outline'}
                  disabled={pending()}
                  onClick={() => choose(theme.id)}
                >
                  {theme.label}
                </Button>
              )}
            </For>
          </div>
          <Show when={failure()}>
            <p role="alert" class="text-sm text-error">
              {failure()}
            </p>
          </Show>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default defineWebExtension({
  slots: { overlay: Themes },
  commands: [
    {
      id: picker,
      title: 'Choose a color theme',
      group: 'Ultimate',
      run: (context) => context.open(picker),
    },
  ],
})
