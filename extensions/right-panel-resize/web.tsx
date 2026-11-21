import { defineWebExtension, island } from '@/sdk'
import { Overlay } from './web.solid.tsx'

// Ultimate loads a web facet from `web.tsx` and expects slot components typed as React; a Solid component
// reaches a slot through `island`, the same shape the built-in Solid facets use (extensions/keep-warm/web.tsx).
export default defineWebExtension({ slots: { overlay: [island(Overlay)] } })
