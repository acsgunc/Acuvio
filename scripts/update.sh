#!/usr/bin/env bash
#
# Acuvio dependency updater — macOS / Linux launcher.
#
# This is a thin wrapper around scripts/update-deps.mjs (the real cross-platform
# logic lives there). It checks for Node and Rust, then forwards all arguments.
#
# Usage:
#   ./scripts/update.sh                # safe minor/patch updates
#   ./scripts/update.sh --check        # preview what is outdated
#   ./scripts/update.sh --latest       # bump to newest majors
#   ./scripts/update.sh --cargo-only   # only Rust crates
#
# Make it executable once with:  chmod +x scripts/update.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ROOT_DIR"

# --- Node.js (required) ---
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is not installed or not on PATH."
  echo "Install it via your package manager or https://nodejs.org (>= 22.22 / 24.15 / 26)."
  echo "  macOS:  brew install node"
  echo "  Debian: sudo apt install nodejs npm   (or use nvm / fnm for newer versions)"
  exit 1
fi

# --- Rust (optional but recommended; needed for the Tauri backend) ---
if ! command -v cargo >/dev/null 2>&1; then
  echo "Warning: cargo (Rust) not found. The Rust backend won't be updated/verified."
  echo "Install via: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
fi

# Optionally enable major-version bumps for Rust crates.
if command -v cargo >/dev/null 2>&1 && ! cargo upgrade --help >/dev/null 2>&1; then
  echo "Tip: 'cargo install cargo-edit' enables major-version Rust upgrades with --latest."
fi

exec node "$SCRIPT_DIR/update-deps.mjs" "$@"
