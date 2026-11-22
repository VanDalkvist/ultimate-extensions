#!/usr/bin/env bash
# Install/update only Subscription Usage. Preserve SQLite, browser state and local edits.
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd -P)"
source_dir="$repo/extensions/subscription-usage"
destination="$HOME/.ultimate/extensions/subscription-usage"
stamp="$(date '+%Y%m%d-%H%M%S')"

for filename in README.md web.solid.tsx server.ts cache.ts providers.ts types.ts lifecycle.ts; do
  if [[ ! -f "$source_dir/$filename" ]]; then
    echo "[error] Missing source file $source_dir/$filename" >&2
    exit 1
  fi
done

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
  for filename in README.md web.solid.tsx server.ts cache.ts providers.ts types.ts lifecycle.ts; do
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

if [[ ! -f "$destination/web.solid.tsx" || ! -f "$destination/lifecycle.ts" || -f "$destination/web.tsx" ]]; then
  echo "[error] Installed state did not pass validation." >&2
  exit 1
fi

echo "[ok] Subscription Usage Solid facet and disposable core lifecycle installed"
echo "[safe] Usage database untouched: $HOME/.ultimate/subscription-usage.sqlite"
echo "[next] Reload Ultimate. The status-line usage reader should reconnect."
