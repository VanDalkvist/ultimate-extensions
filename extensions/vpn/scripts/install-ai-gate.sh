#!/usr/bin/env bash
set -euo pipefail

CONFIG="${MIHOMO_CONFIG_PATH:-/opt/homebrew/etc/mihomo/config.yaml}"
RULE_DIR="${MIHOMO_RULE_DIR:-/opt/homebrew/etc/mihomo/rules}"
RULE_FILE="$RULE_DIR/ai-services.list"
API="${MIHOMO_API_URL:-http://127.0.0.1:9090}"
YQ="${YQ:-yq}"

if [[ ! -f "$CONFIG" ]]; then echo "Config not found: $CONFIG" >&2; exit 1; fi
if ! command -v "$YQ" >/dev/null 2>&1; then
  echo "Install Mike Farah yq v4 first: brew install yq" >&2
  exit 1
fi
if ! "$YQ" --version | grep -Eq 'version v?4\.'; then
  echo "Mike Farah yq v4 is required." >&2; exit 1
fi
if ! grep -qE '^  - name: PROXY$|^- name: PROXY$' "$CONFIG"; then
  echo "Could not find PROXY group in $CONFIG. No changes made." >&2; exit 1
fi
if ! curl -fsS "$API/version" >/dev/null; then
  echo "Mihomo API is unavailable at $API. Start Mihomo before installing." >&2; exit 1
fi

mkdir -p "$RULE_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP="$CONFIG.backup-ai-gate-$STAMP"
RULE_BACKUP=""
cp -p "$CONFIG" "$BACKUP"
if [[ -f "$RULE_FILE" ]]; then
  RULE_BACKUP="$RULE_FILE.backup-ai-gate-$STAMP"
  cp -p "$RULE_FILE" "$RULE_BACKUP"
fi
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

cat > "$TMP" <<'RULES'
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

# Work on a temporary YAML, validate it, then atomically replace the original.
YAML_TMP=$(mktemp "${CONFIG}.ai-gate.XXXXXX")
cp "$CONFIG" "$YAML_TMP"
"$YQ" -i '
  .proxy-groups |= (
    map(
      if .name == "PROXY" then
        .proxies = ((.proxies // []) | map(select(. != "DIRECT" and . != "REJECT" and . != "REJECT-DROP")))
        | .["empty-fallback"] = "REJECT"
        | del(.now)
      else .
      end
    )
    | map(select(.name != "GENERAL-GATE" and .name != "AI-GATE"))
    + [
      {"name":"GENERAL-GATE","type":"select","proxies":["PROXY","DIRECT"]},
      {"name":"AI-GATE","type":"select","proxies":["PROXY","REJECT"]}
    ]
  )
  | .mode = "rule"
  | .rule-providers."ai-services" = {
      "type":"file",
      "behavior":"classical",
      "format":"text",
      "path":"./rules/ai-services.list"
    }
  | .rules |= (
      map(select(. != "MATCH,PROXY" and . != "MATCH,GENERAL-GATE" and . != "RULE-SET,ai-services,AI-GATE"))
      + ["RULE-SET,ai-services,AI-GATE","MATCH,GENERAL-GATE"]
    )
' "$YAML_TMP"

if ! "$YQ" -e '.proxy-groups[] | select(.name == "PROXY" and .type == "select")' "$YAML_TMP" >/dev/null; then
  echo "PROXY must be a manual select group. Aborting." >&2
  rm -f "$YAML_TMP"; exit 1
fi
if ! "$YQ" -e '.proxy-groups[] | select(.name == "AI-GATE" and (.proxies | index("DIRECT") == null) and (.proxies | index("REJECT") != null))' "$YAML_TMP" >/dev/null; then
  echo "AI-GATE validation failed. Aborting." >&2
  rm -f "$YAML_TMP"; exit 1
fi

cp "$TMP" "$RULE_FILE"
if ! mihomo -t -d "$(dirname "$CONFIG")" >/dev/null; then
  cp "$BACKUP" "$CONFIG"
  [[ -n "$RULE_BACKUP" ]] && cp "$RULE_BACKUP" "$RULE_FILE"
  rm -f "$YAML_TMP"
  echo "Mihomo config validation failed. Original config restored." >&2
  exit 1
fi
cat "$YAML_TMP" > "$CONFIG"
rm -f "$YAML_TMP"

HTTP=$(curl -sS -o /dev/null -w '%{http_code}' -X PUT "$API/configs?force=true" \
  -H 'Content-Type: application/json' -d '{"path":"","payload":""}' || true)
if [[ "$HTTP" != "204" ]]; then
  cp "$BACKUP" "$CONFIG"
  [[ -n "$RULE_BACKUP" ]] && cp "$RULE_BACKUP" "$RULE_FILE"
  echo "Reload failed (HTTP $HTTP). Config and rules restored from backup. Restart Mihomo manually after checking logs." >&2
  exit 1
fi

echo "AI Gate installed."
echo "Config backup: $BACKUP"
[[ -n "$RULE_BACKUP" ]] && echo "Previous rule backup: $RULE_BACKUP"
echo "AI rules: $RULE_FILE"
echo "Groups: PROXY (VPN nodes), GENERAL-GATE (PROXY/DIRECT), AI-GATE (PROXY/REJECT)"
echo "Global Mihomo mode remains rule. AI Gate starts ON (PROXY)."
echo "Use Ultimate VPN extension branch feat/ai-traffic-gate for independent toggles."
