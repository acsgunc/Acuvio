#!/usr/bin/env bash
# Install a double-clickable Acuvio launcher on Linux desktops.
#
# Copies Acuvio.desktop into ~/.local/share/applications with the %ROOT%
# placeholders replaced by this checkout's absolute path, so Acuvio shows up in
# the application menu and is double-clickable from a file manager.
#
# Usage:  ./scripts/install-linux-launcher.sh

set -e
root="$(cd "$(dirname "$0")/.." && pwd)"
src="$root/Acuvio.desktop"
dest_dir="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
dest="$dest_dir/Acuvio.desktop"

if [ ! -f "$src" ]; then
  echo "Could not find $src" >&2
  exit 1
fi

mkdir -p "$dest_dir"
# Escape '&' and '/' so they survive sed's replacement.
esc=$(printf '%s' "$root" | sed -e 's/[&/\]/\\&/g')
sed "s/%ROOT%/$esc/g" "$src" > "$dest"
chmod +x "$dest" "$root/run.sh"

echo "Installed launcher: $dest"
echo "Acuvio should now appear in your application menu."
