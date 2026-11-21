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

If that destination already exists (including a dangling symlink), inspect it first; do not overwrite it. Ultimate discovers the personal extension and rebuilds the web bundle; no server restart is needed. To uninstall, disable it in Ultimate or remove only the symlink you created.

## Screenshots

`scripts/capture-ui.mjs` takes the images in `docs/` from a running Ultimate through the Chrome DevTools Protocol: it
opens a page, clicks each surface in the top navigation, crops the left sidebar away (so private branch and
conversation names stay out) and writes the PNGs. Run it against a checkout you can look at:

```sh
node scripts/capture-ui.mjs http://127.0.0.1:4747 docs
```

