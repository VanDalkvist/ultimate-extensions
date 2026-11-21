# Ultimate extensions

Extensions for [Ultimate](https://github.com/HazAT/ultimate), the coding agent built on Pi Durable. Each one is a folder
that Ultimate discovers; no fork of the core, no patched upstream.

| Extension                                       | What it adds                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| [Desktop sidebar resize](extensions/right-panel-resize) | Drag the inside edge of the left sidebar or the right panel |
| [Files](extensions/files)                       | Browse and edit the project's files, with a Markdown preview          |
| [Terminal](extensions/terminal)                 | A bounded Linux terminal in the browser, started explicitly           |
| [Subscription usage](extensions/subscription-usage) | Provider quota in the status line                                 |

Written against Ultimate's extension API as of the `dfb253d` tree (November 2026): `solid-js` 2.0.3, `@ui-sdk/core` and
`@ui-sdk/solid` 0.1.0-beta.13. They import Ultimate's own SDK (`@/sdk`, `@/components/ui`), so they run inside an
Ultimate checkout rather than as standalone packages; an Ultimate that moved those APIs may need an adjustment.

## Install

Copy a folder into one of Ultimate's extension places and reload the page — no server restart:

```sh
# for every project on this machine
mkdir -p "$HOME/.ultimate/extensions"
cp -r extensions/<name> "$HOME/.ultimate/extensions/"

# or for one project only
cp -r extensions/<name> <project>/.ultimate/extensions/
```

[Terminal](extensions/terminal) needs `pnpm install` inside its folder afterwards (`node-pty` builds against the host's
Node). The others have nothing to install.

## A note on type-checking

`scripts/check-extension.ts` from the Ultimate clone may report type noise for these three — they were written against
this clone's SDK and are compiled by Vite at runtime, which accepts them; each one is verified in a running UI (the
screenshots above are from it). Fixing that noise is welcome but not required to run them.

## On an older Ultimate

Ultimate finds a web facet only through `web.tsx`, and its slot contributions are typed as React components. A Solid
component reaches a slot through `island(...)`, as in
[`extensions/keep-warm/web.tsx`](https://github.com/HazAT/ultimate/blob/main/extensions/keep-warm/web.tsx):

```tsx
// web.tsx
import { defineWebExtension, island } from '@/sdk'
import { Overlay } from './web.solid.tsx'

export default defineWebExtension({ slots: { overlay: [island(Overlay)] } })
```

[Desktop sidebar resize](extensions/right-panel-resize) uses exactly that shape.
