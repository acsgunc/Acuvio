#!/usr/bin/env bash
# Acuvio — one-click launcher for macOS / Linux.
# Run ./run.sh (or double-click in a file manager that executes scripts).
# Installs dependencies on first run, then opens the desktop window.
#
# Optional: ./run.sh --build   (production bundle)
#           ./run.sh --web     (UI only, no Rust backend)

set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  Node.js is not installed or not on PATH."
  echo "  Install it from https://nodejs.org and re-run this script."
  echo
  exit 1
fi

exec node scripts/run.mjs "$@"
