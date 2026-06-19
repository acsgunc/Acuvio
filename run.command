#!/usr/bin/env bash
# Acuvio — one-click launcher for macOS.
#
# Double-click this file in Finder to start the app (Finder runs *.command
# files in Terminal). The first time, make it executable once with:
#   chmod +x run.command
# It installs dependencies on first run, then opens the desktop window.
#
# Optional: ./run.command --build   (production bundle)
#           ./run.command --web     (UI only, no Rust backend)

# Always run from the directory this script lives in, even when launched by
# Finder (which starts in the user's home directory).
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  Node.js is not installed or not on PATH."
  echo "  Install it from https://nodejs.org and re-run this file."
  echo
  read -r -p "Press Return to close…" _
  exit 1
fi

node scripts/run.mjs "$@"
status=$?

if [ "$status" -ne 0 ]; then
  echo
  echo "  Acuvio exited with code $status."
  read -r -p "Press Return to close…" _
fi
exit "$status"
