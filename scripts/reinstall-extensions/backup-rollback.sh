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
  [[ -d "$backup" && -f "$backup/manifest.tsv" ]] || fail "Backup not found: $id"
  [[ ! -f "$backup/ROLLED_BACK" ]] || fail "Backup was already rolled back: ${backup##*/}"

  local project_root=""
  [[ ! -f "$backup/project-root.txt" ]] || project_root="$(cat "$backup/project-root.txt")"
  if grep -q '^project[[:space:]]' "$backup/manifest.tsv"; then
    [[ -n "$project_root" && -d "$project_root" ]] ||
      fail "Original project root is missing; restore it first: $project_root"
    [[ -d "$project_root/.ultimate/.extension-backups/${backup##*/}" ]] ||
      fail "Project backup payload is missing under $project_root/.ultimate/.extension-backups"
  fi

  info "rollback" "Restoring ${backup##*/}"
  while IFS=$'\t' read -r scope ext state; do
    [[ -n "$scope" && -n "$ext" && -n "$state" ]] || continue
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
  if [[ -n "$project_root" ]]; then
    date -u '+%Y-%m-%dT%H:%M:%SZ' > "$project_root/.ultimate/.extension-backups/${backup##*/}/ROLLED_BACK"
  fi
  info "done" "Rollback complete. Newer extension copies are retained under each backup's after/ folder."
}
