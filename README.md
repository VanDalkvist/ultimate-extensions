# Ultimate extensions

Extensions for [Ultimate](https://github.com/HazAT/ultimate), the coding agent built on Pi Durable. Each one is a folder
that Ultimate discovers; no fork of the core, no patched upstream.

| Extension                                       | What it adds                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| [Desktop sidebar resize](extensions/right-panel-resize) | Drag the inside edge of the left sidebar or the right panel |
| [Files](extensions/files)                       | Browse and edit the project's files, with a Markdown preview          |
| [Terminal](extensions/terminal)                 | A bounded macOS and Linux terminal in the browser, started explicitly           |
| [Subscription usage](extensions/subscription-usage) | Provider quota in the status line                                 |
| [Themes](extensions/themes)                     | Choose Default or Obsidian Minimal per project                       |
| [Mihomo VPN](extensions/vpn) | Control an existing Mihomo proxy: choose a server, check latency, open Dashboard and settings |

These are the **Solid** versions: each browser facet is `web.solid.tsx`, so no React compatibility layer is needed.
Written against Ultimate's extension API as of the `339e593` tree (22 November 2026): `solid-js` 2.0.3, `@ui-sdk/core` and
`@ui-sdk/solid` 0.1.0-beta.13.
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

If that destination already exists (including a symlink), inspect its source before replacing it. Ultimate discovers the personal extension and rebuilds the web bundle; no server restart is needed. To uninstall, disable it in Ultimate or remove only the symlink you created.

### Reinstall all extensions from this repository

The collection installer updates copy-installed extensions in `~/.ultimate/extensions` and, when explicitly selected, existing project overrides. It leaves symlinks that already point to this checkout in place. It stages the source before replacing anything, backs up the previous folders, and keeps the backup outside Ultimate's extension discovery directory.

Run from this repository:

```sh
# Initialize the VPN source dependency after a fresh clone
git submodule update --init --recursive

# Preview destinations; no files are changed
bash scripts/reinstall-extensions.sh --dry-run

# Apply global copies and existing overrides in the current project
bash scripts/reinstall-extensions.sh --apply --project-root "$PWD" --ultimate-root /absolute/path/to/ultimate

# List saved restore points
bash scripts/reinstall-extensions.sh --list-backups

# Restore a specific backup ID printed by --apply
bash scripts/reinstall-extensions.sh --rollback <backup-id>
```

Omit `--project-root` to update only personal extensions. `--ultimate-root` is used to recreate the Files extension's link to the host `node_modules` when no installed Files dependency link exists. The Terminal native `node_modules/node-pty` folder is preserved; use `--with-deps` only for a first install or an intentional dependency rebuild. Stop Terminal shells and quit/reload Ultimate around deployment. The Usage SQLite database, browser drafts, provider credentials, Mihomo daemon and Mihomo config are outside this installer's write scope.

Backups are stored under `~/.ultimate/.extension-backups/<backup-id>`. Existing project override contents are backed up under `<project>/.ultimate/.extension-backups/<backup-id>`; keep both backup locations until rollback is no longer needed. Rollback also retains the newer copies under each backup's `after/` directory.

[Terminal](extensions/terminal) needs `npm ci` inside its folder afterwards and a required macOS source build; follow its README using the host's Node. [Mihomo VPN](extensions/vpn) requires `git submodule update --init --recursive` and has its own safe installer/readiness check; initialize its dependency before copying it. Mihomo VPN targets the native Solid 2 facet API; it does not manage WireGuard tunnels. [Files](extensions/files) needs `pnpm install --frozen-lockfile` inside its folder for the editor and preview. The remaining extensions have no dependency installation.

[Themes](extensions/themes) uses Ultimate’s native Solid extension API and needs no dependency installation. Copy `extensions/themes` as shown above, reload, and run **Choose a color theme** in the command palette. Pick **Obsidian Minimal**, then select **Default** to remove the overrides.

## Screenshots

`scripts/capture-ui.mjs` takes the images in `docs/` from a running Ultimate through the Chrome DevTools Protocol: it
opens a page, clicks each surface in the top navigation, crops the left sidebar away (so private branch and
conversation names stay out) and writes the PNGs. Run it against a checkout you can look at:

```sh
node scripts/capture-ui.mjs http://127.0.0.1:4747 docs
```
