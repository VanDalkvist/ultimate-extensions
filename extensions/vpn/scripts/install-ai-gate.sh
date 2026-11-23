#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
CONFIG="${MIHOMO_CONFIG_PATH:-/opt/homebrew/etc/mihomo/config.yaml}"
CONFIG_DIR="$(cd "$(dirname "$CONFIG")" 2>/dev/null && pwd -P)" || {
  echo "[error] Configuration directory does not exist: $(dirname "$CONFIG")" >&2; exit 1;
}
CONFIG="$CONFIG_DIR/$(basename "$CONFIG")"
RULE_DIR="$CONFIG_DIR/rules"
RULE_FILE="$RULE_DIR/ultimate-ai-services.list"
PROVIDER_NAME="ultimate-ai-services"
RULE_LINE="RULE-SET,$PROVIDER_NAME,AI-GATE"
API="${MIHOMO_API_URL:-http://127.0.0.1:9090}"
YQ="${YQ:-$(command -v yq 2>/dev/null || true)}"
MIHOMO_BIN="${MIHOMO_BIN:-$(command -v mihomo 2>/dev/null || true)}"
BACKUP_ROOT="$CONFIG_DIR/.ai-gate-backups"
STARTED=0
COMMITTED=0
YAML_TMP=""
RULE_TMP=""
BACKUP_DIR=""
fail() { echo "[error] $*" >&2; exit 1; }
sha256() { shasum -a 256 "$1" | awk '{print $1}'; }
api_reload() {
  curl -sS --max-time 10 -o /dev/null -w '%{http_code}' \
    -X PUT "$API/configs?force=true" \
    -H 'Content-Type: application/json' \
    -d '{"path":"","payload":""}' 2>/dev/null || true
}
restore_live_files() {
  [[ -n "$BACKUP_DIR" && -d "$BACKUP_DIR" ]] || return 1
  local restore_tmp=""
  if [[ -f "$BACKUP_DIR/config.yaml" ]]; then
    restore_tmp="$(mktemp "$CONFIG_DIR/.config.ai-gate-restore.XXXXXX")" || return 1
    cp -p "$BACKUP_DIR/config.yaml" "$restore_tmp" || { rm -f "$restore_tmp"; return 1; }
    mv -f "$restore_tmp" "$CONFIG" || { rm -f "$restore_tmp"; return 1; }
  fi
  if [[ "$(cat "$BACKUP_DIR/rule-existed")" == "yes" ]]; then
    [[ -f "$BACKUP_DIR/ultimate-ai-services.list" ]] || return 1
    mkdir -p "$RULE_DIR" || return 1
    restore_tmp="$(mktemp "$RULE_DIR/.ai-gate-restore.XXXXXX")" || return 1
    cp -p "$BACKUP_DIR/ultimate-ai-services.list" "$restore_tmp" || { rm -f "$restore_tmp"; return 1; }
    mv -f "$restore_tmp" "$RULE_FILE" || { rm -f "$restore_tmp"; return 1; }
  else
    rm -f "$RULE_FILE" || return 1
  fi
  FILES_RESTORED=1
  local status
  status="$(api_reload)"
  if [[ "$status" != "204" ]]; then
    echo "[warning] Files restored, but Mihomo did not reload the old config (HTTP $status). Restart Mihomo after checking its log." >&2
    return 1
  fi
  return 0
}
cleanup() {
  local status=$?
  trap - EXIT
  [[ -z "$YAML_TMP" ]] || rm -f "$YAML_TMP"
  [[ -z "$RULE_TMP" ]] || rm -f "$RULE_TMP"
  if ((STARTED && !COMMITTED)); then
    echo "[recovery] Installation did not complete. Restoring original config and rule file." >&2
    restore_live_files || echo "[warning] Automatic reload/restore needs manual attention. Backup: $BACKUP_DIR" >&2
  fi
  exit "$status"
}
trap cleanup EXIT
if [[ "${1:-}" == "--rollback" ]]; then
  [[ $# -eq 2 ]] || fail "Usage: $0 --rollback <backup-id>"
  BACKUP_ID="$2"
  [[ "$BACKUP_ID" =~ ^[A-Za-z0-9._-]+$ ]] || fail "Invalid backup ID"
  BACKUP_DIR="$BACKUP_ROOT/$BACKUP_ID"
  [[ -d "$BACKUP_DIR" && -f "$BACKUP_DIR/manifest" ]] || fail "AI Gate backup not found: $BACKUP_ID"
  [[ ! -f "$BACKUP_DIR/ROLLED_BACK" ]] || fail "This backup was already rolled back"
  [[ -f "$BACKUP_DIR/config.yaml" && -f "$BACKUP_DIR/rule-existed" ]] || fail "Backup is incomplete"
  if [[ "$(cat "$BACKUP_DIR/rule-existed")" == "yes" ]]; then
    [[ -f "$BACKUP_DIR/ultimate-ai-services.list" ]] || fail "Backup AI rule file is missing"
  fi
  EXPECTED_CONFIG="$(awk -F= '$1=="installed_config_sha256" {print $2}' "$BACKUP_DIR/manifest")"
  EXPECTED_RULE="$(awk -F= '$1=="installed_rule_sha256" {print $2}' "$BACKUP_DIR/manifest")"
  [[ -n "$EXPECTED_CONFIG" && -n "$EXPECTED_RULE" ]] || fail "Backup manifest has no installed file hashes"
  [[ -f "$CONFIG" ]] || fail "Current Mihomo config is missing: $CONFIG"
  [[ "$(sha256 "$CONFIG")" == "$EXPECTED_CONFIG" ]] ||
    fail "Mihomo config changed since AI Gate installation. Review it manually before rollback."
  [[ -f "$RULE_FILE" && "$(sha256 "$RULE_FILE")" == "$EXPECTED_RULE" ]] ||
    fail "AI rule file changed since installation. Review it manually before rollback."
  STARTED=1
  if restore_live_files; then
    date -u '+%Y-%m-%dT%H:%M:%SZ' > "$BACKUP_DIR/ROLLED_BACK"
    COMMITTED=1
    echo "[done] Restored original Mihomo config and AI rules from $BACKUP_DIR"
    exit 0
  fi
  if ((FILES_RESTORED)); then
    date -u '+%Y-%m-%dT%H:%M:%SZ' > "$BACKUP_DIR/ROLLED_BACK"
    COMMITTED=1
    fail "Original files are restored on disk, but Mihomo did not confirm reload. Restart Mihomo and inspect its log."
  fi
  fail "Rollback could not restore the original files. Backup remains at $BACKUP_DIR"
fi
[[ $# -eq 0 ]] || fail "Usage: $0 [--rollback <backup-id>]"
[[ -f "$CONFIG" ]] || fail "Config not found: $CONFIG"
[[ ! -L "$CONFIG" ]] || fail "Config path is a symlink; resolve it explicitly before installation"
[[ ! -L "$RULE_FILE" ]] || fail "AI rule file path is a symlink; inspect it before installation"
[[ ! -L "$BACKUP_ROOT" ]] || fail "AI Gate backup path is a symlink; inspect it before installation"
[[ -n "$YQ" && -x "$YQ" ]] || fail "Install Mike Farah yq v4: brew install yq"
[[ -n "$MIHOMO_BIN" && -x "$MIHOMO_BIN" ]] || fail "Mihomo executable not found; set MIHOMO_BIN"
"$YQ" --version | grep -Eq 'version v?4\.' || fail "Mike Farah yq v4 is required"
[[ -w "$CONFIG" && -w "$CONFIG_DIR" ]] || fail "No write access to $CONFIG. Run with sudo while preserving MIHOMO_CONFIG_PATH/YQ/MIHOMO_BIN."
[[ "$API" =~ ^http://(127\.0\.0\.1|localhost):[0-9]+$ ]] || fail "MIHOMO_API_URL must be a loopback HTTP origin such as http://127.0.0.1:9090"
curl -fsS --max-time 5 "$API/version" >/dev/null || fail "Mihomo API is unavailable at $API"
"$YQ" -e '.proxy-groups[] | select(.name == "PROXY" and .type == "select")' "$CONFIG" >/dev/null ||
  fail "Could not find a manual PROXY selector in $CONFIG"
LAST_RULE="$("$YQ" -r '.rules[-1] // ""' "$CONFIG")"
[[ "$LAST_RULE" == MATCH,* ]] || fail "The final rule must be MATCH,...; refusing to reorder an unknown rule set"
PROXY_USE="$("$YQ" -o=yaml -r '.proxy-groups[] | select(.name == "PROXY") | .use // []' "$CONFIG")"
[[ -n "$PROXY_USE" && "$PROXY_USE" != "[]" ]] || fail "PROXY must define provider references under use; AI-NODES only accepts provider-backed VPN nodes"
export PROXY_USE
for group in GENERAL-GATE AI-GATE; do
  COUNT="$("$YQ" -r "[.proxy-groups[]? | select(.name == \"$group\")] | length" "$CONFIG")"
  if [[ "$COUNT" != "0" ]]; then
    if [[ "$group" == "GENERAL-GATE" ]]; then
      "$YQ" -e '.proxy-groups[] | select(.name == "GENERAL-GATE" and .type == "select" and .proxies == ["PROXY", "DIRECT"])' "$CONFIG" >/dev/null ||
        fail "A different group already uses GENERAL-GATE; rename it manually before installing"
    else
      "$YQ" -e '.proxy-groups[] | select(.name == "AI-GATE" and .type == "select" and .proxies == ["AI-NODES", "REJECT"])' "$CONFIG" >/dev/null ||
        fail "A different group already uses AI-GATE; rename it manually before installing"
    fi
  fi
done
AI_NODES_EXISTS="$("$YQ" -r '[.proxy-groups[]? | select(.name == "AI-NODES")] | length' "$CONFIG")"
if [[ "$AI_NODES_EXISTS" != "0" ]]; then
  "$YQ" -e '(.proxy-groups[] | select(.name == "AI-NODES" and .type == "select" and .["empty-fallback"] == "REJECT") | .use) == (.proxy-groups[] | select(.name == "PROXY") | .use)' "$CONFIG" >/dev/null ||
    fail "A different group already uses AI-NODES; rename it manually before installing"
fi
PROVIDER_EXISTS="$("$YQ" -r '.["rule-providers"] // {} | has("ultimate-ai-services")' "$CONFIG")"
if [[ "$PROVIDER_EXISTS" == "true" ]]; then
  "$YQ" -e '.["rule-providers"]["ultimate-ai-services"] == {"type":"file","behavior":"classical","format":"text","path":"./rules/ultimate-ai-services.list"}' "$CONFIG" >/dev/null ||
    fail "A different rule-provider already uses the name ultimate-ai-services"
fi

STAMP="$(date '+%Y%m%d-%H%M%S')-$$-$RANDOM"
mkdir -p "$BACKUP_ROOT" "$RULE_DIR"
BACKUP_DIR="$BACKUP_ROOT/$STAMP"
mkdir "$BACKUP_DIR"
cp -p "$CONFIG" "$BACKUP_DIR/config.yaml"
if [[ -f "$RULE_FILE" ]]; then
  printf 'yes\n' > "$BACKUP_DIR/rule-existed"
  cp -p "$RULE_FILE" "$BACKUP_DIR/ultimate-ai-services.list"
else
  printf 'no\n' > "$BACKUP_DIR/rule-existed"
fi

YAML_TMP="$(mktemp "$CONFIG_DIR/.config.ai-gate.XXXXXX")"
RULE_TMP="$(mktemp "$RULE_DIR/.ultimate-ai-services.XXXXXX")"
cp -p "$CONFIG" "$YAML_TMP"

cat > "$RULE_TMP" <<'RULES'
# OpenAI / ChatGPT / Codex
DOMAIN-SUFFIX,openai.com
DOMAIN-SUFFIX,chatgpt.com
DOMAIN-SUFFIX,oaistatic.com
DOMAIN-SUFFIX,oaiusercontent.com
DOMAIN-SUFFIX,oaistatsig.com
DOMAIN,ws.chatgpt.com
# Anthropic / Claude / Claude Code
DOMAIN-SUFFIX,anthropic.com
DOMAIN-SUFFIX,claude.ai
DOMAIN-SUFFIX,claude.com
DOMAIN-SUFFIX,claudeusercontent.com
# Gemini / AI Studio (avoid broad googleapis.com and gstatic.com)
DOMAIN,gemini.google.com
DOMAIN,ai.google.dev
DOMAIN,generativelanguage.googleapis.com
DOMAIN,aistudio.google.com
# Other AI services
DOMAIN-SUFFIX,perplexity.ai
DOMAIN-SUFFIX,openrouter.ai
RULES

PROXY_USE="$PROXY_USE" "$YQ" -i '
  (.proxy-groups[] | select(.name == "PROXY") | .use) as $proxy_use
  | .proxy-groups |= (
    map(
      if .name == "PROXY" then
        .proxies = ((.proxies // []) | map(select(. != "DIRECT" and . != "REJECT" and . != "REJECT-DROP")))
        | .["empty-fallback"] = "REJECT"
        | (if .now == "DIRECT" then del(.now) else . end)
      else .
      end
    )
    | map(select(.name != "AI-NODES" and .name != "GENERAL-GATE" and .name != "AI-GATE"))
    + [
      {"name":"AI-NODES","type":"select","use":env(PROXY_USE),"empty-fallback":"REJECT"},
      {"name":"GENERAL-GATE","type":"select","proxies":["PROXY","DIRECT"]},
      {"name":"AI-GATE","type":"select","proxies":["AI-NODES","REJECT"]}
    ]
  )
  | .mode = "rule"
  | .["rule-providers"]["ultimate-ai-services"] = {
      "type":"file",
      "behavior":"classical",
      "format":"text",
      "path":"./rules/ultimate-ai-services.list"
    }
  | .rules = (["RULE-SET,ultimate-ai-services,AI-GATE"] + ((.rules // []) | map(select(. != "RULE-SET,ultimate-ai-services,AI-GATE"))))
' "$YAML_TMP"

chmod 600 "$YAML_TMP"

"$YQ" -e '.mode == "rule"' "$YAML_TMP" >/dev/null || fail "Staged config is not in rule mode"
"$YQ" -e '.rules[0] == "RULE-SET,ultimate-ai-services,AI-GATE"' "$YAML_TMP" >/dev/null || fail "AI rule is not first"
"$YQ" -e '(.rules[-1] | startswith("MATCH,"))' "$YAML_TMP" >/dev/null || fail "MATCH rule is no longer final"
"$YQ" -e '.proxy-groups[] | select(.name == "PROXY" and .type == "select" and (.proxies | index("DIRECT") == null) and .["empty-fallback"] == "REJECT")' "$YAML_TMP" >/dev/null ||
  fail "PROXY selector validation failed"
"$YQ" -e '.proxy-groups[] | select(.name == "GENERAL-GATE" and .type == "select" and .proxies == ["PROXY","DIRECT"])' "$YAML_TMP" >/dev/null ||
  fail "GENERAL-GATE validation failed"
"$YQ" -e '.proxy-groups[] | select(.name == "AI-NODES" and .type == "select" and .["empty-fallback"] == "REJECT" and (.use | length > 0))' "$YAML_TMP" >/dev/null ||
  fail "AI-NODES must contain subscription proxy providers and reject empty fallback"
"$YQ" -e '.proxy-groups[] | select(.name == "AI-GATE" and .type == "select" and .proxies == ["AI-NODES","REJECT"])' "$YAML_TMP" >/dev/null ||
  fail "AI-GATE validation failed"

STARTED=1
mv -f "$RULE_TMP" "$RULE_FILE"
RULE_TMP=""
"$MIHOMO_BIN" -t -d "$CONFIG_DIR" -f "$YAML_TMP" >/dev/null || fail "Mihomo rejected the staged config; original files will be restored"

mv -f "$YAML_TMP" "$CONFIG"
YAML_TMP=""
HTTP="$(api_reload)"
[[ "$HTTP" == "204" ]] || fail "Mihomo reload returned HTTP $HTTP; original files will be restored"

CONFIG_SHA="$(sha256 "$CONFIG")"
RULE_SHA="$(sha256 "$RULE_FILE")"
{
  printf 'backup_id=%s\n' "$STAMP"
  printf 'rule_existed=%s\n' "$(cat "$BACKUP_DIR/rule-existed")"
  printf 'installed_config_sha256=%s\n' "$CONFIG_SHA"
  printf 'installed_rule_sha256=%s\n' "$RULE_SHA"
} > "$BACKUP_DIR/manifest"
COMMITTED=1

echo "[done] AI Gate installed and Mihomo reloaded."
echo "[backup] $BACKUP_DIR"
echo "[rollback] sudo env MIHOMO_CONFIG_PATH='$CONFIG' bash $0 --rollback '$STAMP'"
echo "[groups] PROXY (regular nodes + static proxies), AI-NODES (subscription providers only), GENERAL-GATE (PROXY/DIRECT), AI-GATE (AI-NODES/REJECT)"
echo "[rules] AI domain rule inserted first; existing remaining rule order preserved."
echo "[note] AI Gate only enforces matching rules while Mihomo is in rule mode and has a functioning route."
