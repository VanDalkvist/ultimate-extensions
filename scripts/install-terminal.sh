#!/usr/bin/env bash
# Refresh Ultimate Terminal source only. Never reset node-pty or user data.
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd -P)"
source_dir="$repo/extensions/terminal"
project_root="${1:-${ULTIMATE_PROJECT_ROOT:-$PWD}}"
[[ -d "$project_root" ]] || { echo "[error] Invalid project root: $project_root" >&2; exit 1; }
project_root="$(cd "$project_root" && pwd -P)"
user_dir="$HOME/.ultimate/extensions/terminal"
project_dir="$project_root/.ultimate/extensions/terminal"
stamp="$(date '+%Y%m%d-%H%M%S')-$$"

files=(README.md)
# Always include the entire top-level Solid/TypeScript dependency closure.
# Earlier hand-maintained lists silently left installed imports unresolved.
for from in "$source_dir"/*.ts "$source_dir"/*.solid.tsx "$source_dir"/*.css; do
  [[ -f "$from" ]] || continue
  files+=("${from##*/}")
done
for required in web.solid.tsx auto-start.ts shell-launch.ts lifecycle.ts; do
  [[ -f "$source_dir/$required" ]] || {
    echo "[error] Missing required Terminal module: $required" >&2
    exit 1
  }
done

preflight() {
  local target="$1"
  if [[ -L "$target" ]]; then
    local actual
    actual="$(cd "$target" && pwd -P)"
    if [[ "$actual" != "$source_dir" ]]; then
      echo "[error] Refusing unrelated installed extension symlink: $target -> $actual" >&2
      exit 1
    fi
  elif [[ -d "$target" ]]; then
    for name in "${files[@]}" web.tsx; do
      if [[ -L "$target/$name" ]]; then
        echo "[error] Refusing installed file symlink: $target/$name" >&2
        exit 1
      fi
    done
  elif [[ -e "$target" ]]; then
    echo "[error] Installed Terminal path is not a directory: $target" >&2
    exit 1
  fi
}
preflight "$user_dir"
if [[ -d "$project_dir" && "$project_dir" != "$user_dir" ]]; then
  preflight "$project_dir"
fi

install_to() {
  local target="$1"
  if [[ -L "$target" ]]; then
    echo "[ok] Terminal source already linked: $target"
    return
  fi
  mkdir -p "$target"
  for name in "${files[@]}"; do
    local from="$source_dir/$name"
    local to="$target/$name"
    if [[ -f "$to" ]] && ! cmp -s "$from" "$to"; then
      cp -p "$to" "$to.backup-$stamp"
      echo "[backup] $to.backup-$stamp"
    fi
    cp "$from" "$to"
  done
  if [[ -f "$target/web.tsx" ]]; then
    mv "$target/web.tsx" "$target/web.tsx.backup-$stamp"
    echo "[backup] Disabled obsolete React facet: $target/web.tsx"
  fi
  echo "[ok] Terminal Solid facet installed at $target"
  if [[ ! -d "$target/node_modules/node-pty" ]]; then
    echo "[notice] Native node-pty dependency is not installed in $target"
    echo "         Run npm ci from this directory and rebuild the macOS spawn-helper if needed."
  else
    echo "[ok] Existing native node-pty dependency preserved"
  fi
}

install_to "$user_dir"
# A project-scoped extension overrides the user copy. Update it only if it
# already exists; never create a new project-specific override.
if [[ -d "$project_dir" && "$project_dir" != "$user_dir" ]]; then
  install_to "$project_dir"
fi
echo "[next] Restart Ultimate to load the new Terminal source."
