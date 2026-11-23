# Source discovery, installation preflight and staged-copy validation.
# Sourced by scripts/reinstall-extensions.sh after its configuration is loaded.

copy_tree() {
  local source="$1" target="$2"
  mkdir -p "$(dirname "$target")"
  command -v rsync >/dev/null 2>&1 ||
    fail "rsync is required to copy extension folders while excluding native node_modules"
  mkdir -p "$target"
  rsync -a --exclude='/node_modules/' "$source/" "$target/"
}

resolved_link_target() {
  local link="$1"
  (cd "$link" 2>/dev/null && pwd -P) || return 1
}

source_path() { printf '%s' "$REPO_ROOT/extensions/$1"; }

preflight_source() {
  local ext="$1" src
  src="$(source_path "$ext")"
  [[ -d "$src" ]] || fail "Missing source extension: $src"
  [[ -f "$src/README.md" ]] || fail "$ext is missing README.md"
  [[ -f "$src/web.solid.tsx" ]] || fail "$ext is missing web.solid.tsx"
}

preflight_special_sources() {
  [[ -f "$REPO_ROOT/extensions/files/server.ts" ]] || fail "Files server.ts is missing"
  [[ -f "$REPO_ROOT/extensions/right-panel-resize/panel.ts" ]] || fail "Resize panel.ts is missing"
  [[ -f "$REPO_ROOT/extensions/subscription-usage/navigation.ts" ]] || fail "Usage navigation.ts is missing"
  [[ -f "$REPO_ROOT/extensions/subscription-usage/lifecycle.ts" ]] || fail "Usage lifecycle.ts is missing"
  [[ -f "$REPO_ROOT/extensions/terminal/package-lock.json" ]] || fail "Terminal package-lock.json is missing"
  [[ -f "$REPO_ROOT/extensions/terminal/server.ts" ]] || fail "Terminal server.ts is missing"
  [[ -f "$REPO_ROOT/extensions/themes/registry.ts" ]] || fail "Themes registry.ts is missing"
  [[ -f "$REPO_ROOT/extensions/vpn/server.ts" ]] || fail "VPN server.ts is missing"
  [[ -s "$REPO_ROOT/extensions/vpn/dependencies/mihomo-daemon/index.ts" ]] ||
    fail "VPN Mihomo submodule is empty. Run: git submodule update --init --recursive"
}

preflight_target() {
  local target="$1" src="$2"
  if [[ -L "$target" ]]; then
    local actual
    actual="$(resolved_link_target "$target")" || fail "Dangling or inaccessible extension symlink: $target"
    [[ "$actual" == "$src" ]] ||
      fail "Refusing foreign extension symlink: $target -> $actual"
    info "keep" "$target already links to repository source"
    return 2
  fi
  [[ ! -e "$target" || -d "$target" ]] ||
    fail "Installed extension path is not a directory: $target"
}

preserve_runtime_dependencies() {
  local ext="$1" target="$2" staged="$3"
  if [[ "$ext" == "terminal" && $WITH_DEPS -eq 1 ]]; then
    info "deps" "Installing Terminal dependencies in staged copy"
    (cd "$staged" && npm ci)
    if [[ "$(uname -s)" == "Darwin" ]]; then
      (cd "$staged/node_modules/node-pty" && npm exec --yes --package=node-gyp@13.1.0 -- node-gyp rebuild)
    fi
  elif [[ -e "$target/node_modules" || -L "$target/node_modules" ]]; then
    cp -a "$target/node_modules" "$staged/node_modules"
  elif [[ "$ext" == "files" ]]; then
    local host_modules=""
    if [[ -n "$ULTIMATE_ROOT" && -d "$ULTIMATE_ROOT/node_modules" ]]; then
      host_modules="$ULTIMATE_ROOT/node_modules"
    elif [[ -d "$REPO_ROOT/../ultimate/node_modules" ]]; then
      host_modules="$(cd "$REPO_ROOT/../ultimate" && pwd -P)/node_modules"
    fi
    [[ -n "$host_modules" ]] ||
      fail "Files needs a node_modules link. Supply --ultimate-root /path/to/ultimate or keep the current installed Files folder."
    ln -s "$host_modules" "$staged/node_modules"
  elif [[ "$ext" == "terminal" ]]; then
    fail "Terminal node_modules are missing at $target. Re-run with --with-deps to build them explicitly."
  fi
}

verify_staged_extension() {
  local ext="$1" staged="$2"
  [[ -f "$staged/web.solid.tsx" ]] || fail "Staged $ext has no web.solid.tsx"
  case "$ext" in
    files)
      [[ -e "$staged/node_modules" ]] || fail "Staged Files has no node_modules link"
      [[ -f "$staged/server.ts" ]] || fail "Staged Files is incomplete"
      ;;
    subscription-usage)
      [[ -f "$staged/navigation.ts" && -f "$staged/lifecycle.ts" ]] ||
        fail "Staged Usage dependency closure is incomplete"
      ;;
    terminal)
      [[ -f "$staged/server.ts" && -f "$staged/package-lock.json" ]] ||
        fail "Staged Terminal source is incomplete"
      [[ -d "$staged/node_modules/node-pty" ]] ||
        fail "Staged Terminal has no node-pty. Use --with-deps on first installation."
      ;;
    vpn)
      [[ -s "$staged/dependencies/mihomo-daemon/index.ts" ]] ||
        fail "Staged VPN is missing its Mihomo submodule"
      ;;
  esac
}
