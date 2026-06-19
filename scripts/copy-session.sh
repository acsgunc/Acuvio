#!/usr/bin/env bash
#
# Acuvio Copilot session copier — macOS / Linux launcher.
#
# Thin wrapper around scripts/copy-session.mjs (the real cross-platform logic
# lives there). Copies the latest GitHub Copilot Chat transcript for this
# workspace into docs/copilot/copilot-session.jsonl. Forwards all arguments.
#
# Usage:
#   ./scripts/copy-session.sh                 # auto-discover newest transcript
#   ./scripts/copy-session.sh <path.jsonl>    # copy a specific transcript
#
# Make it executable once with:  chmod +x scripts/copy-session.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is not installed or not on PATH." >&2
  echo "Install it from https://nodejs.org/ or your package manager." >&2
  exit 1
fi

node "$SCRIPT_DIR/copy-session.mjs" "$@"
