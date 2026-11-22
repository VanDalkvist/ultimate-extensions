import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import type { JsonValue } from '@earendil-works/chord/json'
import { defineDoc, defineExtension, ROOT_CONVERSATION_ID } from '@earendil-works/pi-durable'
import type { Harness, Tx } from '@earendil-works/pi-durable'
import { defaultTheme, findTheme, selectionKind, themes } from './registry.ts'

export default defineExtension({ name: 'themes' })

type ActionContext = {
  host: { harness(): Harness }
  uiChanged(tx: Tx, change: { key: string; value: string; previous: string }): Promise<void>
}

const Selection = defineDoc<{ id: string }>({
  kind: selectionKind,
  checkpointWhen: () => false,
  version: 1,
  scope: 'conversation',
  history: 'latest',
  fork: 'initial',
  initial: () => ({ id: defaultTheme }),
})
export const docs = [Selection]

async function select(id: string, action: ActionContext) {
  await action.host.harness().commit(async (tx) => {
    const doc = await tx.doc(Selection, ROOT_CONVERSATION_ID)
    if (doc.id === id) return
    await action.uiChanged(tx, { key: selectionKind, value: id, previous: doc.id })
    doc.id = id
  }, BACKGROUND_CONTEXT)
  return { id }
}

export const actions = {
  list: () => themes.map(({ id, label }) => ({ id, label })),
  async current(_args: JsonValue, { host }: ActionContext) {
    const doc = await host.harness().snapshot(Selection, ROOT_CONVERSATION_ID, BACKGROUND_CONTEXT)
    return { id: findTheme(doc?.id)?.id ?? defaultTheme }
  },
  apply(args: JsonValue, action: ActionContext) {
    const id = args && typeof args === 'object' && !Array.isArray(args) ? args.id : undefined
    const theme = findTheme(id)
    if (!theme) throw new Error('Unknown theme; use themes/list to see installed themes.')
    return select(theme.id, action)
  },
  reset: (_args: JsonValue, action: ActionContext) => select(defaultTheme, action),
}
