#!/usr/bin/env bash
# Install/update only Subscription Usage. Preserve SQLite, browser state and local edits.
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd -P)"
source_dir="$repo/extensions/subscription-usage"
destination="$HOME/.ultimate/extensions/subscription-usage"
stamp="$(date '+%Y%m%d-%H%M%S')"

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

if [[ -L "$destination" ]]; then
  resolved="$(cd "$destination" && pwd -P)"
  if [[ "$resolved" != "$source_dir" ]]; then
    echo "[error] Installed extension points to another checkout:" >&2
    echo "        $destination -> $resolved" >&2
    echo "[hint] Update that checkout or relink explicitly; nothing changed." >&2
    exit 1
  fi
  echo "[ok] Already linked to current repository"
else
  mkdir -p "$destination"
  for filename in "${files[@]}"; do
    from="$source_dir/$filename"
    to="$destination/$filename"
    if [[ -L "$to" ]]; then
      echo "[error] Refusing to replace installed symlink: $to" >&2
      exit 1
    fi
    if [[ -f "$to" ]] && ! cmp -s "$from" "$to"; then
      cp -p "$to" "$to.backup-$stamp"
      echo "[backup] $to.backup-$stamp"
    fi
    cp "$from" "$to"
  done
  echo "[ok] Updated $destination"
fi

legacy="$destination/web.tsx"
if [[ -L "$legacy" ]]; then
  echo "[error] Old React facet is a symlink: $legacy; inspect manually." >&2
  exit 1
fi
if [[ -f "$legacy" ]]; then
  mv "$legacy" "$legacy.backup-$stamp"
  echo "[backup] Disabled obsolete React web.tsx"
fi

if [[ ! -f "$destination/web.solid.tsx" || ! -f "$destination/lifecycle.ts" || ! -f "$destination/navigation.ts" || -f "$destination/web.tsx" ]]; then
  echo "[error] Installed state did not pass validation." >&2
  exit 1
fi

echo "[ok] Subscription Usage Solid facet and disposable core lifecycle installed"
echo "[safe] Usage database untouched: $HOME/.ultimate/subscription-usage.sqlite"
echo "[next] Reload Ultimate. The status-line usage reader should reconnect."
