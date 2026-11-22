import { defineWebExtension, island } from '@/sdk'
import { Overlay } from './web.solid.tsx'

// Этот клон ищет точку входа в `web.tsx` и ждёт Solid-компоненты слотов в обёртке `island`.
export default defineWebExtension({ slots: { overlay: [island(Overlay)] } })
