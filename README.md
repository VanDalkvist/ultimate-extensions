# Ultimate extensions

Personal extensions for [Ultimate](https://github.com/HazAT/ultimate).

- [Desktop sidebar resize](extensions/right-panel-resize): drag the inside edge of either desktop Agent sidebar. The extension uses the public Solid SDK, with a narrow adapter for the current shell DOM because the SDK does not expose panel widths.

## Install

From this checkout, run:

```sh
mkdir -p "$HOME/.ultimate/extensions"
destination="$HOME/.ultimate/extensions/right-panel-resize"
if [ ! -e "$destination" ] && [ ! -L "$destination" ]; then
  ln -s "$PWD/extensions/right-panel-resize" "$destination"
fi
```

If that destination already exists (including a dangling symlink), inspect it first; do not overwrite it. Ultimate discovers the personal extension and rebuilds the web bundle; no server restart is needed. To uninstall, disable it in Ultimate or remove only the symlink you created.
