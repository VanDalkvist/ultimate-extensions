# Backup discovery and rollback for scripts/reinstall-extensions.sh.
# Sourced by the CLI after fail/info and path configuration are defined.

scope_backup_path() {
  local backup="$1" scope="$2"
  if [[ "$scope" == "global" ]]; then
    printf '%s' "$backup"
  else
    local root
    root="$(cat "$backup/project-root.txt")"
    printf '%s' "$root/.ultimate/.extension-backups/${backup##*/}"
  fi
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
  if ((found == 0)); then info "empty" "No available extension backups"; fi
}


validate_rollback_manifest() {
  local backup="$1" project_root="$2" scope ext state target before scope_backup
  awk -F '\\t' '
    NF != 3 { exit 1 }
    $1 !~ /^(global|project)$/ { exit 1 }
    $2 !~ /^(files|right-panel-resize|subscription-usage|terminal|themes|vpn)$/ { exit 1 }
    $3 !~ /^(present|absent)$/ { exit 1 }
    seen[$1 SUBSEP $2]++ { exit 1 }
    END { if (NR == 0) exit 1 }
  ' "$backup/manifest.tsv" || fail "Backup manifest is malformed or contains duplicate/unknown entries"

  while IFS=$'\\t' read -r scope ext state; do
    if [[ "$scope" == "global" ]]; then
      target="$GLOBAL_ROOT/$ext"
    else
      [[ -n "$project_root" && -d "$project_root" ]] || fail "Project root from backup is unavailable: $project_root"
      target="$project_root/.ultimate/extensions/$ext"
    fi
    scope_backup="$(scope_backup_path "$backup" "$scope")"
    before="$scope_backup/before/$scope/$ext"
    [[ ! -L "$target" ]] || fail "Rollback target became a symlink: $target"
    [[ ! -L "$before" ]] || fail "Rollback backup entry is a symlink: $before"
    if [[ "$state" == "present" ]]; then
      [[ -d "$before" ]] || fail "Backup payload is missing for $scope/$ext"
    fi
  done < "$backup/manifest.tsv"
}

rollback_snapshot() {
  local id="$1" backup
  if [[ "$id" == "latest" ]]; then
    local candidate=""
    if [[ -d "$BACKUP_ROOT" ]]; then
      local path
      for path in "$BACKUP_ROOT"/*; do
        [[ -d "$path" && -f "$path/manifest.tsv" && ! -f "$path/ROLLED_BACK" ]] || continue
        if [[ -z "$candidate" || "${path##*/}" > "${candidate##*/}" ]]; then candidate="$path"; fi
      done
    fi
    [[ -n "$candidate" ]] || fail "No available extension backup to restore"
    backup="$candidate"
  else
    backup="$BACKUP_ROOT/$id"
  fi
  [[ "$id" == "latest" || "$id" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || fail "Invalid backup ID"
  [[ ! -L "$backup" ]] || fail "Backup path is a symlink; inspect it manually"
  [[ -d "$backup" && -f "$backup/manifest.tsv" ]] || fail "Backup not found: $id"
  [[ ! -f "$backup/ROLLED_BACK" ]] || fail "Backup was already rolled back: ${backup##*/}"

  local project_root=""
  [[ ! -f "$backup/project-root.txt" ]] || project_root="$(cat "$backup/project-root.txt")"
  if [[ -n "$project_root" ]]; then
    [[ "$project_root" == /* && "$project_root" != "/" ]] || fail "Invalid project root in backup metadata"
  fi
  if grep -q '^project[[:space:]]' "$backup/manifest.tsv"; then
    [[ ! -L "$project_root/.ultimate" && ! -L "$project_root/.ultimate/extensions" && ! -L "$project_root/.ultimate/.extension-backups" ]] ||
      fail "Project .ultimate/extensions or backup root became a symlink"
    [[ -n "$project_root" && -d "$project_root" ]] ||
      fail "Original project root is missing; restore it first: $project_root"
    [[ -d "$project_root/.ultimate/.extension-backups/${backup##*/}" ]] ||
      fail "Project backup payload is missing under $project_root/.ultimate/.extension-backups"
  fi

  validate_rollback_manifest "$backup" "$project_root"
  info "rollback" "Restoring ${backup##*/}"
  while IFS=$'\t' read -r scope ext state; do
    [[ -n "$scope" && -n "$ext" && -n "$state" ]] || continue
    case "$ext" in
      files|right-panel-resize|subscription-usage|terminal|themes|vpn) ;;
      *) fail "Invalid extension name in backup manifest: $ext" ;;
    esac
    case "$state" in
      present|absent) ;;
      *) fail "Invalid backup state for $ext: $state" ;;
    esac
    local target before after scope_backup
    if [[ "$scope" == "global" ]]; then
      target="$GLOBAL_ROOT/$ext"
    elif [[ "$scope" == "project" ]]; then
      target="$project_root/.ultimate/extensions/$ext"
    else
      fail "Invalid backup manifest scope: $scope"
    fi
    scope_backup="$(scope_backup_path "$backup" "$scope")"
    before="$scope_backup/before/$scope/$ext"
    after="$scope_backup/after/$scope/$ext"

    if [[ "$state" == "present" && ! -d "$before" ]]; then
      fail "Backup payload is missing for $scope/$ext; refusing to guess which version is installed"
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
  if [[ -n "$project_root" ]]; then
    date -u '+%Y-%m-%dT%H:%M:%SZ' > "$project_root/.ultimate/.extension-backups/${backup##*/}/ROLLED_BACK"
  fi
  info "done" "Rollback complete. Newer extension copies are retained under each backup's after/ folder."
}
