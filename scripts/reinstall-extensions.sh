#!/usr/bin/env bash
# Reinstall all Ultimate extensions shipped by this repository.
# Default mode is dry-run. Use --apply to stage, back up and swap copies.
set -Eeuo pipefail
umask 077

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
ULTIMATE_HOME="${ULTIMATE_HOME:-$HOME/.ultimate}"
GLOBAL_ROOT="$ULTIMATE_HOME/extensions"
BACKUP_ROOT="$ULTIMATE_HOME/.extension-backups"
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

SOURCE_DIR="$REPO_ROOT/scripts/reinstall-extensions"
source "$SOURCE_DIR/source-preflight.sh"
source "$SOURCE_DIR/backup-rollback.sh"
preflight_global_roots

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
preflight_target_roots

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

if ((${#TARGET_PATHS[@]} == 0)); then
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

mkdir -p "$ULTIMATE_HOME" "$BACKUP_ROOT"
STAMP="$(date '+%Y%m%d-%H%M%S')-$$-$RANDOM"
BACKUP="$BACKUP_ROOT/$STAMP"
mkdir -p "$BACKUP/before/global" "$BACKUP/after/global"
: > "$BACKUP/manifest.tsv"
if [[ -n "$PROJECT_ROOT" ]] && printf '%s\n' "$PROJECT_ROOT" > "$BACKUP/project-root.txt"; then
  mkdir -p "$PROJECT_ROOT/.ultimate/.extension-backups/$STAMP/before/project"
  mkdir -p "$PROJECT_ROOT/.ultimate/.extension-backups/$STAMP/after/project"
fi

GLOBAL_STAGE_ROOT="$(mktemp -d "$ULTIMATE_HOME/.extension-stage.XXXXXX")"
PROJECT_STAGE_ROOT=""
if [[ -n "$PROJECT_ROOT" ]] && [[ -d "$PROJECT_ROOT/.ultimate/extensions" ]]; then
  PROJECT_STAGE_ROOT="$(mktemp -d "$PROJECT_ROOT/.ultimate/.extension-stage.XXXXXX")"
fi
cleanup() {
  rm -rf "$GLOBAL_STAGE_ROOT"
  [[ -z "$PROJECT_STAGE_ROOT" ]] || rm -rf "$PROJECT_STAGE_ROOT"
}
trap cleanup EXIT

for i in "${!TARGET_PATHS[@]}"; do
  scope="${TARGET_SCOPES[$i]}"
  ext="${TARGET_NAMES[$i]}"
  target="${TARGET_PATHS[$i]}"
  if [[ "$scope" == "global" ]]; then stage_base="$GLOBAL_STAGE_ROOT"; else stage_base="$PROJECT_STAGE_ROOT"; fi
  staged="$stage_base/$ext"
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
  if [[ "$scope" == "global" ]]; then
    stage_base="$GLOBAL_STAGE_ROOT"; scope_backup="$BACKUP"
  else
    stage_base="$PROJECT_STAGE_ROOT"; scope_backup="$PROJECT_ROOT/.ultimate/.extension-backups/$STAMP"
  fi
  staged="$stage_base/$ext"
  if [[ -d "$target" ]]; then state="present"; else state="absent"; fi
  printf '%s\t%s\t%s\n' "$scope" "$ext" "$state" >> "$BACKUP/manifest.tsv"
  CHANGED=1
  if [[ "$state" == "present" ]]; then
    mkdir -p "$scope_backup/before/$scope"
    mv "$target" "$scope_backup/before/$scope/$ext"
  else
    mkdir -p "$(dirname "$target")"
  fi
  mv "$staged" "$target"
  info "installed" "$target"
done

trap - ERR
info "done" "All selected extensions installed."
info "backup" "$BACKUP"
printf '[rollback] bash %q --rollback %q\\n' "$REPO_ROOT/scripts/reinstall-extensions.sh" "$STAMP"
info "next" "Reload Ultimate. Stop active Terminal shells before replacing the installed Terminal folder."
