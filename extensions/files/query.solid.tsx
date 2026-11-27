import { createEffect, createSignal, onSettled, type Accessor } from 'solid-js'
import { api, type ActionRef } from '@/sdk/solid'

export function useFilesQuery<Args extends object, Result>(
  ref: ActionRef<Args, Result>,
  args: Accessor<Args | undefined>,
  options: { on?: Accessor<unknown>; focus?: boolean } = {},
) {
  const [state, setState] = createSignal<{ data?: Result; error?: unknown; loading: boolean }>({
    loading: true,
  })
  const [focus, setFocus] = createSignal(0)
  onSettled(() => {
    if (!options.focus) return undefined
    const refresh = () => setFocus((count) => count + 1)
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  })
  createEffect(
    () => ({ args: args(), refresh: options.on?.(), focus: focus() }),
    (request, previous) => {
      if (!request.args) {
        setState({ loading: false })
        return undefined
      }
      const controller = new AbortController()
      const signal = controller.signal
      const data =
        JSON.stringify(previous?.args) === JSON.stringify(request.args) ? state().data : undefined
      setState({ data, loading: true })
      void api.action(ref, request.args, { signal }).then(
        (result) => {
          if (!signal.aborted) setState({ data: result, loading: false })
        },
        (error: unknown) => {
          if (!signal.aborted) setState({ data, error, loading: false })
        },
      )
      return () => controller.abort()
    },
  )
  return {
    data: () => state().data,
    error: () => state().error,
    loading: () => state().loading,
  }
}
