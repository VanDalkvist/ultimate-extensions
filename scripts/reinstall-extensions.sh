#!/usr/bin/env bash
# Reinstall all Ultimate extensions shipped by this repository.
# Default mode is dry-run. Use --apply to stage, back up and atomically swap copies.
set -Eeuo pipefail
umask 077

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
ULTIMATE_HOME="${ULTIMATE_HOME:-$HOME/.ultimate}"
GLOBAL_ROOT="$ULTIMATE_HOME/extensions"
BACKUP_ROOT="$ULTIMATE_HOME/extension-backups"
PROJECT_ROOT=""
ULTIMATE_ROOT="${ULTIMATE_ROOT:-}"
MODE="dry-run"
BACKUP_ID=""
WITH_DEPS=0

EXTENSIONS=(files right-panel-resize subscription-usage terminal themes vpn)

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/reinstall-extensions.sh [--dry-run | --apply]
      [--project-root PATH] [--ultimate-root PATH] [--with-deps]
  bash scripts/reinstall-extensions.sh --list-backups
  bash scripts/reinstall-extensions.sh --rollback <backup-id|latest>

Options:
  --dry-run          Validate and show planned changes (default).
  --apply            Deploy all six user extensions with a backup.
  --project-root     Also update extension overrides already present in this project.
  --ultimate-root    Ultimate checkout containing node_modules (Files dependency link).
  --with-deps        Run npm ci and macOS node-pty source build in staged Terminal.
  --list-backups     List available rollback snapshots.
  --rollback ID      Restore a previous snapshot; 'latest' selects newest available.
USAGE
}

fail() { echo "[error] $*" >&2; exit 1; }
info() { printf '[%s] %s\n' "$1" "$2"; }

while (($#)); do
  case "$1" in
    --dry-run) MODE="dry-run"; shift ;;
    --apply) MODE="apply"; shift ;;
    --project-root)
      (($# >= 2)) || fail "--project-root requires a path"
      PROJECT_ROOT="$2"; shift 2 ;;
    --ultimate-root)
      (($# >= 2)) || fail "--ultimate-root requires a path"
      ULTIMATE_ROOT="$2"; shift 2 ;;
    --with-deps) WITH_DEPS=1; shift ;;
    --list-backups) MODE="list"; shift ;;
    --rollback)
      (($# >= 2)) || fail "--rollback requires an ID or latest"
      MODE="rollback"; BACKUP_ID="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

copy_tree() {
  local source="$1" target="$2"
  mkdir -p "$(dirname "$target")"
  if command -v rsync >/dev/null 2>&1; then
    mkdir -p "$target"
    rsync -a --exclude='/node_modules/' "$source/" "$target/"
  else
    fail "rsync is required to copy extension folders while excluding native node_modules"
  fi
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

list_backups() {
  if [[ ! -d "$BACKUP_ROOT" ]]; then
    info "empty" "No extension backups found"
    return
  fi
  local found=0 path
  for path in "$BACKUP_ROOT"/*; do
    [[ -d "$path" && -f "$path/manifest.tsv" ]] || continue
    [[ -f "$path/ROLLED_BACK" ]] && continue
    found=1
    printf '%s\n' "${path##*/}"
  done
  ((found)) || info "empty" "No available extension backups"
}

backup_path() { printf '%s' "$BACKUP_ROOT/$1"; }

rollback_snapshot() {
  local id="$1" backup
  if [[ "$id" == "latest" ]]; then
    local candidate=""
    if [[ -d "$BACKUP_ROOT" ]]; then
      for path in "$BACKUP_ROOT"/*; do
        [[ -d "$path" && -f "$path/manifest.tsv" && ! -f "$path/ROLLED_BACK" ]] || continue
        if [[ -z "$candidate" || "${path##*/}" > "${candidate##*/}" ]]; then candidate="$path"; fi
      done
    fi
    [[ -n "$candidate" ]] || fail "No available extension backup to restore"
    backup="$candidate"
  else
    backup="$(backup_path "$id")"
  fi
  [[ -d "$backup" && -f "$backup/manifest.tsv" ]] || fail "Backup not found: $id"
  [[ ! -f "$backup/ROLLED_BACK" ]] || fail "Backup was already rolled back: ${backup##*/}"

  local project_root=""
  [[ ! -f "$backup/project-root.txt" ]] || project_root="$(cat "$backup/project-root.txt")"
  if grep -q '^project[[:space:]]' "$backup/manifest.tsv"; then
    [[ -n "$project_root" && -d "$project_root" ]] ||
      fail "Original project root is missing; restore it first: $project_root"
  fi

  info "rollback" "Restoring ${backup##*/}"
  while IFS=$'\t' read -r scope ext state; do
    [[ -n "$scope" && -n "$ext" && -n "$state" ]] || continue
    local target before after
    if [[ "$scope" == "global" ]]; then
      target="$GLOBAL_ROOT/$ext"
    elif [[ "$scope" == "project" ]]; then
      target="$project_root/.ultimate/extensions/$ext"
    else
      fail "Invalid backup manifest scope: $scope"
    fi
    before="$backup/before/$scope/$ext"
    after="$backup/after/$scope/$ext"

    if [[ "$state" == "present" && ! -d "$before" ]]; then
      if [[ -e "$target" || -L "$target" ]]; then
        info "unchanged" "$target was not moved before the failed install"
        continue
      fi
      fail "Backup payload is missing for $scope/$ext and the original target is absent"
    fi
    if [[ -e "$target" || -L "$target" ]]; then
      mkdir -p "$(dirname "$after")"
      mv "$target" "$after"
    fi
    if [[ "$state" == "present" ]]; then
      mkdir -p "$(dirname "$target")"
      mv "$before" "$target"
    elif [[ "$state" != "absent" ]]; then
      fail "Invalid backup state for $scope/$ext: $state"
    fi
    info "restored" "$target"
  done < "$backup/manifest.tsv"
  date -u '+%Y-%m-%dT%H:%M:%SZ' > "$backup/ROLLED_BACK"
  info "done" "Rollback complete. Newly installed copies are retained under $backup/after"
}

if [[ "$MODE" == "list" ]]; then list_backups; exit 0; fi
if [[ "$MODE" == "rollback" ]]; then rollback_snapshot "$BACKUP_ID"; exit 0; fi

for ext in "${EXTENSIONS[@]}"; do preflight_source "$ext"; done
preflight_special_sources

if [[ -n "$PROJECT_ROOT" ]]; then
  [[ -d "$PROJECT_ROOT" ]] || fail "Project root does not exist: $PROJECT_ROOT"
  PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd -P)"
fi
if [[ -n "$ULTIMATE_ROOT" ]]; then
  [[ -d "$ULTIMATE_ROOT" ]] || fail "Ultimate root does not exist: $ULTIMATE_ROOT"
  ULTIMATE_ROOT="$(cd "$ULTIMATE_ROOT" && pwd -P)"
fi

TARGET_SCOPES=()
TARGET_NAMES=()
TARGET_PATHS=()

for ext in "${EXTENSIONS[@]}"; do
  src="$(source_path "$ext")"
  target="$GLOBAL_ROOT/$ext"
  if preflight_target "$target" "$src"; then
    TARGET_SCOPES+=("global"); TARGET_NAMES+=("$ext"); TARGET_PATHS+=("$target")
  else
    code=$?
    [[ $code -eq 2 ]] || exit "$code"
  fi
done

if [[ -n "$PROJECT_ROOT" && -d "$PROJECT_ROOT/.ultimate/extensions" ]]; then
  for ext in "${EXTENSIONS[@]}"; do
    target="$PROJECT_ROOT/.ultimate/extensions/$ext"
    [[ -e "$target" || -L "$target" ]] || continue
    src="$(source_path "$ext")"
    if preflight_target "$target" "$src"; then
      TARGET_SCOPES+=("project"); TARGET_NAMES+=("$ext"); TARGET_PATHS+=("$target")
    else
      code=$?
      [[ $code -eq 2 ]] || exit "$code"
    fi
  done
fi

if (("${#TARGET_PATHS[@]}" == 0)); then
  info "current" "Every installed extension already links to the repository source; nothing to copy."
  exit 0
fi

info "source" "$REPO_ROOT"
info "global" "$GLOBAL_ROOT"
[[ -z "$PROJECT_ROOT" ]] || info "project" "$PROJECT_ROOT"
for i in "${!TARGET_PATHS[@]}"; do
  info "plan" "${TARGET_SCOPES[$i]} ${TARGET_NAMES[$i]} -> ${TARGET_PATHS[$i]}"
done

if [[ "$MODE" == "dry-run" ]]; then
  info "dry-run" "No files changed. Use --apply to deploy with rollback backup."
  exit 0
fi

mkdir -p "$GLOBAL_ROOT" "$BACKUP_ROOT"
STAMP="$(date '+%Y%m%d-%H%M%S')-$$-$RANDOM"
BACKUP="$BACKUP_ROOT/$STAMP"
mkdir -p "$BACKUP/before" "$BACKUP/after"
: > "$BACKUP/manifest.tsv"
[[ -z "$PROJECT_ROOT" ]] || printf '%s\n' "$PROJECT_ROOT" > "$BACKUP/project-root.txt"

STAGE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/ultimate-extensions-stage.XXXXXX")"
cleanup() { rm -rf "$STAGE_ROOT"; }
trap cleanup EXIT

for i in "${!TARGET_PATHS[@]}"; do
  ext="${TARGET_NAMES[$i]}"
  target="${TARGET_PATHS[$i]}"
  staged="$STAGE_ROOT/${TARGET_SCOPES[$i]}/$ext"
  mkdir -p "$(dirname "$staged")"
  copy_tree "$(source_path "$ext")" "$staged"
  preserve_runtime_dependencies "$ext" "$target" "$staged"
  verify_staged_extension "$ext" "$staged"
done

CHANGED=0
on_error() {
  local status=$?
  trap - ERR
  if ((CHANGED)); then
    info "recovery" "Deployment interrupted; restoring prior extension folders"
    rollback_snapshot "$STAMP" || info "error" "Automatic restoration needs manual attention. Backup: $BACKUP"
  fi
  exit "$status"
}
trap on_error ERR

for i in "${!TARGET_PATHS[@]}"; do
  scope="${TARGET_SCOPES[$i]}"
  ext="${TARGET_NAMES[$i]}"
  target="${TARGET_PATHS[$i]}"
  staged="$STAGE_ROOT/$scope/$ext"
  if [[ -d "$target" ]]; then state="present"; else state="absent"; fi
  printf '%s\t%s\t%s\n' "$scope" "$ext" "$state" >> "$BACKUP/manifest.tsv"
  CHANGED=1
  if [[ "$state" == "present" ]]; then
    mkdir -p "$BACKUP/before/$scope"
    mv "$target" "$BACKUP/before/$scope/$ext"
  else
    mkdir -p "$(dirname "$target")"
  fi
  mv "$staged" "$target"
  info "installed" "$target"
done

trap - ERR
info "done" "All selected extensions installed."
info "backup" "$BACKUP"
info "rollback" "bash scripts/reinstall-extensions.sh --rollback $STAMP"
info "next" "Reload Ultimate. Native Terminal sessions should be stopped before replacing its installed folder."
