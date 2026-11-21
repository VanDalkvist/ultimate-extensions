Resize Ultimate’s desktop Agent right panel from its left edge; supports the current shell DOM, not the conversation dock or mobile overlay.

Drag the left edge to resize all panel tabs. Focus the separator and use **←** to widen and **→** to narrow (16 px; hold **Shift** for 64 px). **Home** and **End** choose the limits. **Enter** or a double-click resets to the host width. **Escape** cancels an in-progress drag.

The width is saved in extension UI state on a completed drag, keyboard change, reset, or agent action. At rest and during drag, the panel reserves 360 px for the central conversation independently of the left sidebar and project rail; the desired width returns when enough room is available. The normal minimum is 280 px, reduced only if that would take space from the conversation. A temporary transparent shield keeps an embedded iframe from intercepting an active drag. Cancellation (including navigation, closing the panel, or window blur) keeps the previously saved width.

## Host contract

The public Solid SDK provides the `overlay` slot, Agent surface and conversation selection, panel state, viewport, notifications, and durable UI state. It does not provide a panel width setter. `panel.ts` recognizes just the current desktop `Panels` aside in the Agent surface: the terminal sibling immediately after the unique shell `main` containing a direct `[data-ui="conversation"]`, with the host's `w-[22rem]`, `border-l`, and `bg-sidebar` utilities and the PanelTabs/scroll-content structure. If the host no longer matches, the extension leaves it unchanged and shows a warning. The root slot owns the separate fixed-position handle; the only modified property on the host panel is its inline `width`, restored on detach. The extension does not replace the panel or reload its content.

## Development

Run from the collection root with the Ultimate clone alongside it and its dependencies installed. Set `ULTIMATE_CLONE` for a different location.

```sh
node "${ULTIMATE_CLONE:-../ultimate}/scripts/check-extension.ts" "$PWD/extensions/right-panel-resize"
node --test --test-timeout=30000 extensions/right-panel-resize/test/*.test.ts
```
