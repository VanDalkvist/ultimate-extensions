#!/usr/bin/env bash
# Install/update only Subscription Usage. Preserve SQLite, browser state and local edits.
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd -P)"
source_dir="$repo/extensions/subscription-usage"
project_root="${1:-${ULTIMATE_PROJECT_ROOT:-$PWD}}"
[[ -d "$project_root" ]] || { echo "[error] Invalid project root: $project_root" >&2; exit 1; }
project_root="$(cd "$project_root" && pwd -P)"
user_dir="$HOME/.ultimate/extensions/subscription-usage"
project_dir="$project_root/.ultimate/extensions/subscription-usage"
stamp="$(date '+%Y%m%d-%H%M%S')-$RANDOM"

# Discover and sync ALL top-level source dependencies, including navigation.ts.
# A hand-maintained shortlist previously omitted a newly imported file and
# made the installed Solid facet fail despite a successful GitHub merge.
files=(README.md)
for from in "$source_dir"/*.ts "$source_dir"/*.solid.tsx; do
  [[ -f "$from" ]] || continue
  files+=("${from##*/}")
done
for filename in "${files[@]}"; do
  if [[ ! -f "$source_dir/$filename" ]]; then
    echo "[error] Missing source file $source_dir/$filename" >&2
    exit 1
  fi
done
if [[ ! -f "$source_dir/web.solid.tsx" || ! -f "$source_dir/server.ts" ]]; then
  echo "[error] Required Usage facets missing in $source_dir" >&2
  exit 1
fi

# Fail closed on unknown symlinks before changing either installed location.
preflight() {
  local target="$1"
  if [[ -L "$target" ]]; then
    local actual
    actual="$(cd "$target" && pwd -P)"
    if [[ "$actual" != "$source_dir" ]]; then
      echo "[error] Refusing unrelated Usage extension symlink: $target -> $actual" >&2
      exit 1
    fi
  elif [[ -d "$target" ]]; then
    for filename in "${files[@]}" web.tsx; do
      [[ ! -L "$target/$filename" ]] || {
        echo "[error] Refusing to replace installed symlink: $target/$filename" >&2
        exit 1
      }
    done
  elif [[ -e "$target" ]]; then
    echo "[error] Installed Usage path is not a directory: $target" >&2
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
    echo "[ok] Usage extension already linked: $target"
    return
  fi
  mkdir -p "$target"
  for filename in "${files[@]}"; do
    local from="$source_dir/$filename"
    local to="$target/$filename"
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
  if [[ ! -f "$target/web.solid.tsx" || ! -f "$target/lifecycle.ts" || ! -f "$target/navigation.ts" ]]; then
    echo "[error] Usage installed source is incomplete at $target" >&2
    exit 1
  fi
  echo "[ok] Installed Usage Solid facet: $target"
}

install_to "$user_dir"
# A pre-existing project-scoped extension overrides the user's copy.
if [[ -d "$project_dir" && "$project_dir" != "$user_dir" ]]; then
  install_to "$project_dir"
fi

echo "[safe] Subscription Usage DB untouched: $HOME/.ultimate/subscription-usage.sqlite"
echo "[next] Restart Ultimate, then click the Usage status indicator."
