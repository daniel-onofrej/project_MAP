#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# gen-secrets.sh — Generate all Docker Compose secret files under ./secrets/
#
# Usage:
#   chmod +x scripts/gen-secrets.sh
#   ./scripts/gen-secrets.sh
#
# Each secret is a plain-text file with no trailing newline.
# The ./secrets/ directory is git-ignored.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SECRETS_DIR="$(cd "$(dirname "$0")/.." && pwd)/secrets"
mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

gen() {
  local file="$SECRETS_DIR/$1"
  local value="$2"
  if [[ -f "$file" ]]; then
    echo "  [skip]  $1  (already exists)"
  else
    printf '%s' "$value" > "$file"
    chmod 600 "$file"
    echo "  [ok]    $1"
  fi
}

echo ""
echo "Generating secrets in $SECRETS_DIR"
echo "────────────────────────────────────────"

# Infrastructure credentials
gen "db_password.txt"           "$(openssl rand -hex 24)"
gen "session_secret.txt"        "$(openssl rand -hex 32)"
gen "key_encryption_secret.txt" "$(openssl rand -hex 32)"
gen "mcp_auth_token.txt"        "$(openssl rand -hex 32)"

# AI API keys — these cannot be auto-generated; leave as placeholder
for key in gemini_api_key google_generative_ai_api_key openai_api_key anthropic_api_key groq_api_key; do
  gen "${key}.txt" "REPLACE_WITH_REAL_KEY"
done

echo ""
echo "Done. Edit any REPLACE_WITH_REAL_KEY entries in $SECRETS_DIR"
echo "────────────────────────────────────────"
echo ""
