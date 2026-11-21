Resize Ultimate’s desktop Agent left sidebar and right panel; supports the current shell DOM, not the project rail, conversation dock, or narrow overlays.

Drag either inside edge: the right edge of the left sidebar or the left edge of the right panel. Focus a separator and use **←** and **→** to move that edge (16 px; hold **Shift** for 64 px). **Home** and **End** choose the minimum and maximum. **Enter** or a double-click resets that side to the host width.

Each side remembers its own width after a completed drag, keyboard change, reset, or agent action. Both panels share the space left after reserving 360 px for the conversation, separate from the project rail. The normal minima are 200 px on the left and 280 px on the right. If both saved widths cannot fit, the left takes priority above those minima; saved preferences return when there is room. An active resize respects the other panel's current allocation. A temporary transparent shield keeps an embedded iframe from intercepting a drag. A pointer cancellation, lost capture, navigation, panel close, or window blur keeps the previously saved width. Escape is reserved for Ultimate’s own shortcut.

## Host contract

The public Solid SDK provides the `overlay` slot, surface and conversation selection, panel state, viewport, notifications, and durable UI state. It does not provide a width setter. `panel.ts` only matches the Agent shell’s unique `main` containing a direct `[data-ui="conversation"]`:

- Left: the first direct sibling immediately before `main`, an `aside` with `w-72`, `border-r`, `overflow-y-auto`, and the shell's sidebar color utilities.
- Right: the last direct sibling immediately after `main`, an `aside` with `w-[22rem]`, `border-l`, and `bg-sidebar`, with the host’s PanelTabs and scroll-content structure.

The extension runs on desktop only. Once the composer mounts, an expected region that does not match is left unchanged and gets a warning. The root slot owns both fixed-position handles; the only modified property on an aside is its inline `width`, restored on detach. Neither the panels nor their contents are replaced or reloaded by the extension.

## Development

Run from the collection root with the Ultimate clone alongside it and its dependencies installed. Set `ULTIMATE_CLONE` for a different location.

```sh
node "${ULTIMATE_CLONE:-../ultimate}/scripts/check-extension.ts" "$PWD/extensions/right-panel-resize"
node --test --test-timeout=30000 extensions/right-panel-resize/test/*.test.ts
```

For browser verification, `ultimate.detached` disables shared UI writes: use it for geometry, not proof that widths persist. Persistence needs your own writable isolated preview/profile, not removal of that protection in the user's live profile. The host's `web/src/sdk/ui-state.ts` (`tabWrites`) defines the write boundary.

Record original preferences for both left and right panels, then change, flush pending UI writes, reload and read back the saved widths. Report preferred persisted widths separately from viewport-effective clamping and measured left/right geometry. Restore the original preferences in `finally`, flush and verify restoration. A detached reload mismatch is a test-setup error, not evidence that the user changed widths.
